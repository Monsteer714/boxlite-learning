# 第 3 课：Job 实体 — 异步任务与乐观锁

> **源文件**：`apps/api/src/box/entities/job.entity.ts` (169 行)
> **学习目标**：理解 Job 实体的设计、乐观锁机制和唯一性约束。

## Job 是什么？

Job 是 API 和 Runner 之间的**异步任务队列**元素。API 不直接调用 Runner —— 而是创建一个 Job，
Runner 主动拉取并执行。这类似于 Kubernetes 的 work queue 模式。

## 字段详解

```typescript
@PrimaryGeneratedColumn('uuid')
id: string                        // 任务 ID

@VersionColumn()
version: number                   // 乐观锁版本号 ⭐

@Column({ type: 'character varying' })
type: JobType                     // 任务类型

@Column({ type: 'enum', enum: JobStatus, default: JobStatus.PENDING })
status: JobStatus                 // 任务状态

@Column()
runnerId: string                  // 目标 Runner

@Column({ type: 'enum', enum: ResourceType })
resourceType: ResourceType        // 资源类型 (目前只有 BOX)

@Column()
resourceId: string                // 资源 ID (Box ID)

@Column({ nullable: true })
payload: string | null            // 任务负载 (JSON 字符串)

@Column({ nullable: true })
resultMetadata: string | null     // 执行结果元数据

@Column({ type: 'jsonb', nullable: true })
traceContext: Record<string, string> | null  // W3C 分布式追踪上下文

@Column({ nullable: true, type: 'text' })
errorMessage: string | null       // 失败原因

@Column({ nullable: true })
startedAt: Date | null            // 开始执行时间

@Column({ nullable: true })
completedAt: Date | null          // 完成时间
```

## `@VersionColumn` —— 乐观锁

```typescript
@VersionColumn()
version: number
```

TypeORM 的 `@VersionColumn` 在每次 `save()` 时自动递增 `version`，并在 UPDATE 语句中加
`WHERE version = <旧值>`。如果另一个进程已经修改了同一行，version 不匹配 → 抛
`OptimisticLockVersionMismatchError`。

**在 Job 中的作用**：防止同一个 Job 被两个 Runner 同时领取。

```typescript
// claimPendingJobs() 中的乐观锁逻辑 (job.service.ts:476-489)
for (const job of jobs) {
  try {
    job.status = JobStatus.IN_PROGRESS
    job.startedAt = now
    // save() 自动检查 version —— 如果被其他 Runner 抢先了，抛异常
    const savedJob = await this.jobRepository.save(job)
    claimedJobs.push(new JobDto(savedJob))
  } catch (error) {
    // 乐观锁失败 → 跳过（已被其他 Runner 认领）
    this.logger.debug(`Job ${job.id} already claimed by another runner`)
  }
}
```

### 乐观锁 vs 悲观锁

| | 乐观锁 | 悲观锁 |
|---|---|---|
| 实现 | `@VersionColumn` + save() | `SELECT ... FOR UPDATE` |
| 冲突处理 | 抛异常，调用方重试/跳过 | 等待锁释放 |
| 适用场景 | 冲突少，读多写少 | 冲突频繁 |
| 本场景 | ✅ Job 被领取是低频操作 | ❌ |

## JobType 枚举

```typescript
enum JobType {
  CREATE_BOX,
  START_BOX,
  STOP_BOX,
  DESTROY_BOX,
  RECOVER_BOX,
  RESIZE_BOX,                   // 兼容性 sink，实际不使用
  UPDATE_BOX_NETWORK_SETTINGS,
  CREATE_BACKUP,                // 备份专用
  PULL_ARTIFACT,                // 拉取构建产物
}
```

每个 JobType 对应 `resourceType`（`ResourceTypeForJobType<T>` 泛型确保编译时类型安全）。

## JobStatus 状态机

```
PENDING ──► IN_PROGRESS ──► COMPLETED
    │            │
    └── FAILED ◄─┘
```

**状态转换验证**（`isValidStatusTransition()`，第 375-388 行）：

```typescript
const allowedTransitions = {
  [PENDING]:       [IN_PROGRESS, FAILED],
  [IN_PROGRESS]:   [COMPLETED, FAILED],
  [COMPLETED]:     [],            // 终态
  [FAILED]:        [],            // 终态
}
```

一旦到达 `COMPLETED` 或 `FAILED`，不允许再更改。

## 唯一性约束：防止重复 Job

```sql
@Index('IDX_UNIQUE_INCOMPLETE_JOB', ['resourceType', 'resourceId', 'runnerId'], {
  unique: true,
  where: `"completedAt" IS NULL AND "type" != 'CREATE_BACKUP'`,
})
```

这是一个**部分唯一索引**。它保证：
- 同一个资源（Box）+ 同一个 Runner **不会有两个未完成的 Job**
- 但 `completedAt IS NOT NULL` 的行不受限制（历史 Job 可以有很多）
- `CREATE_BACKUP` 类型有自己独立的类似索引

这防止了"用户快速双击创建按钮导致两个 `CREATE_BOX` job 入队"的问题。

## 辅助方法

```typescript
getPayload<T>(): T | null {
  // 安全地 parse JSON payload
  if (!this.payload) return null
  try { return JSON.parse(this.payload) }
  catch { return null }
}

getResultMetadata(): Record<string, any> | null {
  // 安全地 parse 执行结果
  if (!this.resultMetadata) return null
  try { return JSON.parse(this.resultMetadata) }
  catch { return null }
}
```

## 关键设计思想

1. **Job 不是命令，是意图**：API 创建 Job 表示"我希望 Box 达到某个 desiredState"。Runner 执行
   完毕后，Box 的 state 通过 `UpdateBoxState` 单独同步。Job 的 COMPLETED 不一定意味着 Box 已经
   达到期望状态（可能还在启动中）。

2. **乐观锁适合此场景**：Job 的竞争窗口很窄（PENDING → IN_PROGRESS），且通常只有一个 Runner
   在拉取。乐观锁避免了 `SELECT FOR UPDATE` 的锁开销。

3. **payload 是 JSON 字符串**而非 typed column 或关联表，因为不同 JobType 的 payload 结构不同。
   这是 EAV 模式的一种轻量替代 —— 利用 JSON 的灵活性 + TypeScript 泛型保证类型安全。

4. **W3C TraceContext**：每个 Job 携带 OpenTelemetry 的 `traceparent` / `tracestate`，
   使 API → Runner → Box 形成一条完整 trace。

---

**上一课**：[第 2 课：Runner 实体与调度算法](./02-runner-entity.md)
**下一课**：[第 4 课：BoxService.create() — 创建 Box 的完整链路](./04-box-service-create.md)
