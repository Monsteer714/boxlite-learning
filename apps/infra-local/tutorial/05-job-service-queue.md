# 第 5 课：Job 队列系统 — 异步任务的生命周期

> **源文件**：`apps/api/src/box/services/job.service.ts` (498 行)
> **学习目标**：理解 Job 从创建、通知、领取到完成的完整生命周期。

## 整体架构

```
API                                    Redis                  Runner
 │                                       │                      │
 │ createJob()                           │                      │
 │  ├─ INSERT job (PENDING)              │                      │
 │  └─ notifyRunner() ──────────────────►│ LPUSH runner:jobs:X  │
 │                                       │                      │
 │                                       │      ◄── PollJobs ───┤
 │                                       │      │   BRPOP       │
 │                                       ├──────┘               │
 │                                       │                      │
 │  ◄── updateJobStatus() ──────────────┼──────────────────────┤
 │      (COMPLETED / FAILED)             │                      │
```

## 三步法：createJob()

```typescript
async createJob<T extends JobType>(
  manager: EntityManager | null,  // 可选的 DB 事务
  type: T,                         // JobType (泛型约束)
  runnerId: string,
  resourceType: ResourceTypeForJobType<T>,  // 编译时保证 type↔resourceType 匹配
  resourceId: string,
  payload?: string | Record<string, any>,
): Promise<Job>
```

### 步骤 1：捕获追踪上下文

```typescript
const traceContext = this.captureTraceContext()
// 内部: propagation.inject(otelContext.active(), carrier)
// 结果: { traceparent: "00-<traceId>-<spanId>-01", tracestate: "..." }
```

### 步骤 2：创建并插入

```typescript
const job = new Job({ type, runnerId, resourceType, resourceId,
  status: JobStatus.PENDING, payload: encodedPayload, traceContext })
await repo.insert(job)
```

### 步骤 3：通知 Runner

```typescript
await this.redis.lpush(`runner:jobs:${runnerId}`, job.id)
```

⚠️ 通知发生在事务**之后**（如果事务回滚，通知是无害的，Runner poll 后找不到 Job 就跳过）。

### 唯一性冲突处理

```typescript
} catch (error) {
  if (error.code === '23505') {  // Postgres unique_violation
    if (error.constraint === 'IDX_UNIQUE_INCOMPLETE_JOB') {
      throw new JobConflictError()  // 已有未完成的同资源 Job
    }
  }
}
```

## 核心：pollJobs() — 三步领取协议

```typescript
async pollJobs(runnerId: string, limit = 10, timeoutSeconds = 30,
               abortSignal?: AbortSignal): Promise<JobDto[]>
```

这是整个 Job 系统最精妙的方法。三层层层递进：

### STEP 1：先查 DB，原子认领（第 130-141 行）

```typescript
let claimedJobs = await this.claimPendingJobs(runnerId, limit)
if (claimedJobs.length > 0) {
  await this.redis.del(queueKey)  // 清空 Redis 队列（防重复通知）
  return claimedJobs
}
```

`claimPendingJobs()` 做了原子认领：
1. `SELECT * FROM job WHERE runnerId=X AND status='PENDING' ORDER BY createdAt LIMIT N`
2. 逐行 `job.status = 'IN_PROGRESS'; job.startedAt = now; await repo.save(job)`
3. save() 时 `@VersionColumn` 自动检查乐观锁 → 被抢先的跳过

### STEP 2：Redis BRPOP 阻塞等待（第 148-229 行）

```typescript
// 没有 PENDING job → 等新通知
blockingClient = this.redis.duplicate({...})  // 专用连接，不影响其他操作
const result = await blockingClient.brpop(queueKey, maxTimeout)
```

**为什么 duplicate Redis 连接？**
`BRPOP` 是阻塞命令，会占用连接直到超时。如果不 duplicate，会阻塞该 Redis 客户端上的所有其他操作。

**为什么需要 abortSignal？**
Runner 关闭时需要立即停止 BRPOP。通过 `Promise.race([brpopPromise, abortPromise])` 实现。

**BRPOP 返回后**：
1. 清空 Redis 队列（`del queueKey`）
2. 再次执行 `claimPendingJobs()` —— 防止 BRPOP 通知和 DB 写入之间的竞态

### STEP 3：DB 兜底（第 223-229 行）

```typescript
// Redis 超时或出错 → 最后再查一次 DB
claimedJobs = await this.claimPendingJobs(runnerId, limit)
```

这是最终的 fallback。即使 Redis 挂了，Runner 也能通过 DB poll 拿到 Job。

## 状态更新：updateJobStatus()

```typescript
async updateJobStatus(jobId, status, errorMessage?, resultMetadata?): Promise<Job>
```

1. 查出 Job
2. 验证状态转换是否合法（`isValidStatusTransition`）
3. 更新状态 + 时间戳
4. save（乐观锁保护）
5. 如果是终态（COMPLETED/FAILED）→ 异步触发 `jobStateHandlerService.handleJobCompletion()`

### handleJobCompletion 做什么？

- 对于 BOX 类型的 Job：根据 Job type 更新 Box 的 `state`（通过 `UpdateBoxState` 事件）
- 触发后续事件（如 Box 创建完成后通知用户）
- 记录审计日志

## 过期 Job 清理：handleStaleJobs()

```typescript
@Cron(CronExpression.EVERY_MINUTE)
async handleStaleJobs(): Promise<void>
```

每分钟执行一次：

1. 按超时时间分组：DEFAULT(10 分钟), PULL_ARTIFACT(120 分钟)
2. 查询 `status=IN_PROGRESS AND updatedAt < now - timeout`
3. 逐个标记 FAILED，记录错误信息 "Job timed out"

这防止了 Runner 崩溃后 Job 永远卡在 IN_PROGRESS。

## 关键设计思想

1. **三步领取 = 高可用**：Redis 加速（微秒级通知）+ DB 兜底（Redis 挂了也能工作）。
   这种模式在分布式系统中称为 "Read Your Writes" + "Eventual Consistency"。

2. **乐观锁防重**：不依赖 Redis 的原子性，最终一致性由 Postgres 的 `@VersionColumn` 保证。
   即使通知重复送达，同一个 Job 只会被执行一次。

3. **通知是 fire-and-forget**：`notifyRunner` 失败不影响 Job 创建。Runner 的下一次 BRPOP
   超时后会走 DB fallback 拿到 Job。

4. **可中止的 BRPOP**：通过 `AbortSignal` + `Promise.race` + `disconnect()` 实现优雅关闭，
   避免 Runner 退出时等 30 秒才停止。

---

**上一课**：[第 4 课：BoxService.create()](./04-box-service-create.md)
**下一课**：[第 6 课：Runner 启动与组件装配](./06-runner-bootstrap.md)
