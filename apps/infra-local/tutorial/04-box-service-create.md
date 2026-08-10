# 第 4 课：BoxService.create() — 创建 Box 的完整调度链路

> **源文件**：`apps/api/src/box/services/box.service.ts:154-293`（`create()` 方法）
> **相关文件**：`apps/api/src/box/runner-adapter/runnerAdapter.v2.ts`
> **学习目标**：跟踪一条 `POST /api/box` 请求从入口到 Job 入队的完整链路。

## 入口：BoxService.create()

```
POST /api/box
  → BoxController.create()
    → BoxService.create(createBoxDto, organization)
```

## 逐步拆解

### 步骤 1：验证 Region（第 155 行）

```typescript
const region = await this.getValidatedOrDefaultRegion(organization, createBoxDto.target)
```

- 如果用户指定了 `target`（region id），验证其存在且可见
- 否则使用 organization 的默认 region

### 步骤 2：验证并组装参数（第 162-176 行）

```typescript
const boxClass = this.getValidatedOrDefaultClass(createBoxDto.class)
const cpu = createBoxDto.cpu ?? DEFAULT_BOX_CPU       // 默认 1
const mem = createBoxDto.memory ?? DEFAULT_BOX_MEM     // 默认 1
const disk = createBoxDto.disk ?? DEFAULT_BOX_DISK     // 默认 10
const gpu = createBoxDto.gpu ?? DEFAULT_BOX_GPU        // 默认 0

assertWithinPerBoxLimits(cpu, mem, disk, organization) // 边界校验
const image = assertSupportedImage(createBoxDto.image)  // 镜像白名单
```

> **TODO(image-rewrite)**：当前镜像解析系统正在重写，`assertSupportedImage` 目前只是一个
> 占位检查。完整实现恢复后，这里会包含镜像版本解析、架构匹配等逻辑。

### 步骤 3：检查组织状态 + 配额（第 178-186 行）

```typescript
this.organizationService.assertOrganizationIsNotSuspended(organization)

quotaReservation = await this.organizationUsageService.validateOrganizationQuotas(
  organization, cpu, mem, disk, gpu
)
```

`validateOrganizationQuotas` 做两件事：
1. 检查组织配额是否够用（CPU/内存/磁盘/GPU 使用量 + 新 Box ≤ 配额上限）
2. 预留配额（`quotaReservation`），防止并发创建超配额

如果后续创建失败，在 `catch` 块中回滚预留：`rollbackPendingUsage(organization.id, quotaReservation)`

### 步骤 4：Warm Pool 检查（第 188-214 行）

```typescript
if (createBoxDto.volumes && createBoxDto.volumes.length > 0) {
  // 有 volume → 不能用 warm pool，跳过
} else if (image) {
  const skipWarmPool = (await this.redis.exists(`warm-pool:skip:${image}`)) === 1
  if (!skipWarmPool) {
    const warmPoolBox = await this.warmPoolService.fetchWarmPoolBox({ ... })
    if (warmPoolBox) {
      return await this.assignWarmPoolBox(warmPoolBox, createBoxDto, organization)
    }
  }
}
```

**Warm Pool（暖池）**是什么？预先创建好但不分配给任何组织的 Box。有新请求时直接分配，跳过
"创建 microVM + 拉镜像 + 启动"的等待。

流程：
1. 检查 Redis 是否有 `warm-pool:skip:<image>` 键（运维可以临时禁用某个镜像的暖池）
2. `warmPoolService.fetchWarmPoolBox()` 从 warm_pool 表中找一个匹配的空闲 Box
3. 找到 → `assignWarmPoolBox()` 直接分配（更新 orgId + runnerId + 其他字段）
4. 没找到 → 走正常创建流程

### 步骤 5：选择 Runner（第 216-219 行）

```typescript
const runner = await this.runnerService.getRandomAvailableRunner({
  regions: [region.id],
  boxClass,
})
```

这是整个调度系统的核心决策点。详见 [第 2 课](./02-runner-entity.md) 的 TOPSIS 算法。

### 步骤 6：构造 Box 实体（第 221-262 行）

```typescript
const box = new Box(region.id, createBoxDto.name)
box.organizationId = organization.id
box.class = boxClass
box.image = image
box.cpu = cpu; box.mem = mem; box.disk = disk
box.public = createBoxDto.public ?? true
// ... 网络、生命周期策略、volumes ...
box.runnerId = runner.id
box.pending = true         // ← 关键：标记为"待调和"
```

### 步骤 7：持久化（第 267-272 行）

```typescript
const insertedBox = createBoxDto.name
  ? await this.boxRepository.insert(box)
  : await persistWithGeneratedBoxName(box.id, (name) => {
      box.name = name
      return this.boxRepository.insert(box)
    })
```

如果用户没指定名称，`persistWithGeneratedBoxName` 会：
1. 生成一个趣味名称（如 `cozy-otter`）
2. 尝试 INSERT
3. 如果名称冲突（`@Unique` 约束），给名称加 boxId 后缀重试

### 步骤 8：发射事件 → 触发 Job 创建（第 274-276 行）

```typescript
this.eventEmitter.emitAsync(
  BoxEvents.CREATED,
  new BoxCreatedEvent(insertedBox)
)
```

## 事件驱动的 Job 创建

`BoxCreatedEvent` 被 NestJS `EventEmitter2` 异步分发。监听器 `BoxCreatedListener`（或类似命名）
收到事件后调用 `jobService.createJob(CREATE_BOX, ...)`。

这里的关键设计：**Box 的创建和 Job 的创建是解耦的**。`BoxService.create()` 不直接调用
`jobService.createJob()`，而是通过事件机制。这样：
- 可以有多个监听器（审计、通知、metrics...）
- 如果 Job 创建失败，不会回滚 Box 的创建（Box 已存在，`pending=true`，后续 cron 或重试会修复）
- 方便未来在事件层面做扩展（webhook、analytics 等）

## 异常处理

```typescript
catch (error) {
  if (quotaReservation) {
    await this.organizationUsageService.rollbackPendingUsage(...)
  }
  if (error.code === '23505') {  // Postgres unique violation
    throw new ConflictException('Box with name already exists')
  }
  throw error
}
```

- 配额预留回滚
- 名称冲突 → 409 Conflict（而非 500）
- 其他错误 → 原样抛出

## 完整调用图

```
POST /api/box
  BoxController.create(dto, org)
    BoxService.create(dto, org)
      ├─ getValidatedOrDefaultRegion()          # 解析 region
      ├─ assertWithinPerBoxLimits()             # 单 Box 上限校验
      ├─ assertSupportedImage()                 # 镜像白名单
      ├─ assertOrganizationIsNotSuspended()     # 组织状态检查
      ├─ validateOrganizationQuotas()           # 配额检查 + 预留
      ├─ warmPoolService.fetchWarmPoolBox()     # 尝试暖池
      │   └─ 命中 → assignWarmPoolBox() → return
      ├─ runnerService.getRandomAvailableRunner()  # TOPSIS 调度
      │   ├─ 过滤 (state/region/class/score)
      │   ├─ 排序 (availabilityScore DESC)
      │   └─ top 10 → 随机 1
      ├─ new Box(region, name)                  # 构造实体
      ├─ boxRepository.insert(box)              # 持久化
      └─ eventEmitter.emitAsync(CREATED)        # 发射事件
            │
            └─ [监听器] jobService.createJob(CREATE_BOX, ...)
                 ├─ captureTraceContext()        # W3C 追踪
                 ├─ repo.insert(job)             # Job 入库
                 └─ redis.lpush("runner:jobs:<id>", jobId)  # 通知 Runner
```

---

**上一课**：[第 3 课：Job 实体与乐观锁](./03-job-entity.md)
**下一课**：[第 5 课：Job 队列系统](./05-job-service-queue.md)
