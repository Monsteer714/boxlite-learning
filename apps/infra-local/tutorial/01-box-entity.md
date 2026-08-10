# 第 1 课：Box 实体 — 微虚拟机的数据模型

> **源文件**：`apps/api/src/box/entities/box.entity.ts` (280 行)
> **学习目标**：理解 Box 实体的每个字段、状态机、不变式约束和数据库索引设计。

## Box 是什么？

Box 是 BoxLite 的核心抽象 —— 一个**硬件隔离的微虚拟机实例**。在 API 层，Box 是一个 TypeORM
实体，映射到 Postgres 的 `box` 表。每个 Box 属于一个 Organization，被调度到一个 Runner 上执行。

## 字段详解

### 标识与归属

```typescript
@PrimaryColumn({ type: 'character varying', length: BOX_ID_LENGTH })
id: string                    // 自定义 ID，构造函数中 generateBoxId() 生成

@Column({ type: 'uuid' })
organizationId: string        // 所属组织

@Column()
name: string                  // 组织内唯一 (@Unique(['organizationId', 'name']))
```

Box ID 由 `generateBoxId()` 生成，通过 `BOX_ID_REGEX` 校验格式。`assertValid()` 在每次持久化前
确保 ID 合法。名称由用户指定或自动生成（如 `cozy-otter`），组织内唯一。

### 位置与调度

```typescript
@Column()
region: string                // 区域 (如 'us', 'eu')

@Column({ type: 'uuid', nullable: true })
runnerId?: string             // 当前分配到的 Runner

@Column({ type: 'uuid', nullable: true })
prevRunnerId?: string         // 之前所在的 Runner（用于恢复/回滚）

@Column({ type: 'enum', enum: BoxClass, default: BoxClass.SMALL })
class = BoxClass.SMALL        // 规格: SMALL / MEDIUM / LARGE
```

`prevRunnerId` 的设计很巧妙：当 Box 从一个 Runner 迁移到另一个时，如果新 Runner 分配失败，
可以用 `prevRunnerId` 回滚到原来的 Runner。

### 状态机

```typescript
@Column({ type: 'enum', enum: BoxState, default: BoxState.UNKNOWN })
state = BoxState.UNKNOWN

@Column({ type: 'enum', enum: BoxDesiredState, default: BoxDesiredState.STARTED })
desiredState = BoxDesiredState.STARTED

@Column({ default: false })
pending: boolean | undefined = false
```

**BoxState**（实际状态）：
```
UNKNOWN → CREATING → STARTING → RUNNING → STOPPING → STOPPED
              ↓          ↓                            ↓
           ERROR      ERROR                   DESTROYING → DESTROYED
                                               ARCHIVING  → ARCHIVED
```

**BoxDesiredState**（期望状态）：`STARTED` / `STOPPED` / `DESTROYED`

**核心不变式**（`enforceInvariants()`，第 254-278 行）：

```typescript
// pending 的推导规则：
// 1. state != desiredState  →  pending = true  （正在调和）
// 2. state == desiredState  →  pending = false （已达到期望）
// 3. state == ERROR         →  pending = false （错误终态，不再调和）

// 终态清理：
// 4. DESTROYED / ARCHIVED   →  runnerId = null  （释放 Runner 资源）
```

`pending=true` 意味着 API 已经发出了指令（创建/启动/停止/销毁），但实际状态尚未达到期望。
Runner 在执行 Job 后通过 `UpdateBoxState` 同步实际状态回来，API 收到后重新计算 `pending`。

### 状态转换验证（`validateDesiredStateTransition()`）

```typescript
desiredState = STARTED:  允许当前 state 为 STARTED/STOPPED/STARTING/CREATING/UNKNOWN/...
desiredState = STOPPED:  允许当前 state 为 STARTED/STOPPING/STOPPED/ERROR/...
desiredState = DESTROYED: 允许当前 state 为 DESTROYED/DESTROYING/STOPPED/STARTED/...
```

这个验证防止了非法的状态切换请求，例如不能在 `CREATING` 状态时直接要求 `DESTROYED`。

### 资源配置

```typescript
cpu = 2       // vCPU 数量，默认 2
gpu = 0       // GPU 数量，默认 0
mem = 4       // 内存 (GB)，默认 4
disk = 10     // 磁盘 (GB)，默认 10

@Column({ type: 'jsonb', default: [] })
volumes: BoxVolume[] = []    // 挂载的外部卷
```

### 网络

```typescript
@Column({ default: false })
networkBlockAll = false       // 是否阻断所有出站流量

@Column({ nullable: true })
networkAllowList?: string     // 出站白名单
```

### 生命周期策略

```typescript
autoStop: number    // 空闲自动停止秒数 (DEFAULT_AUTO_STOP_SECONDS)
autoDelete: number  // 停止后自动销毁秒数 (AUTO_DELETE_DISABLED = -1 表示禁用)
autoResume: boolean // 访问时自动恢复 (DEFAULT_AUTO_RESUME = true)
```

这三个字段实现了 Serverless 式的生命周期管理：Box 在一段时间不活动后自动停止，
被访问时自动恢复（如果 proxy 转发请求时发现 box 停了，触发 resume）。

### 安全

```typescript
@Column({ type: 'character varying' })
authToken = nanoid(32).toLowerCase()   // 内部认证令牌，Box 与 API 通信用
```

### 软删除

```typescript
static getSoftDeleteUpdate(box: Box): Partial<Box> {
  return {
    pending: true,
    desiredState: BoxDesiredState.DESTROYED,
    name: 'DESTROYED_' + box.name + '_' + Date.now(),
  }
}
```

软删除不是真的删行，而是：设置 `desiredState=DESTROYED` + 重命名（释放原名称供复用）。

## 数据库索引设计

```sql
@Unique(['organizationId', 'name'])              -- 组织内名称唯一
@Index(['state'])                                 -- 按状态查询
@Index(['desiredState'])                          -- 按期望状态查询
@Index(['runnerId'])                              -- 按 Runner 查所有 Box
@Index(['runnerId', 'state'])                     -- Runner + 状态组合查询
@Index(['organizationId'])                        -- 按组织查询
@Index(['region'])                                 -- 按区域查询
@Index(['cpu', 'mem', 'disk', 'gpu'])            -- 按资源配置查询
@Index(['runnerId', 'state', 'desiredState'],     -- 已调和完成的 Box
  { where: '"pending" = false' })
@Index(['id'],                                    -- 活跃 Box（非终态）
  { where: '"state" <> ALL (ARRAY['destroyed','archived']) })
@Index(['id'],                                    -- 待调和的 Box
  { where: '"pending" = true' })
@Index(['authToken'])                             -- 按 authToken 查找
```

索引设计反映了实际查询模式：
- `box_runner_state_idx` 用于 Runner 的 `BoxSyncService`（只关心自己的 Box）
- `box_active_only_idx` 部分索引只覆盖活跃 Box，列表查询不会扫到已销毁的
- `box_pending_idx` 部分索引用于寻找"需要处理"的 Box

## 关键设计思想

1. **期望状态 vs 实际状态**：API 不改 Box 的 `state`（那是 Runner 通过 `UpdateBoxState` 上报的），只改 `desiredState`。`pending` 标志桥接两者。

2. **不变式集中在实体上**：`enforceInvariants()` 在每次 save 前自动调用，保证无论代码路径如何，`pending` 和 `runnerId` 的一致性不会被破坏。

3. **类型安全的状态转换**：`validateDesiredStateTransition()` 用 switch-case 显式枚举每个合法转换，非法转换抛异常。

---

**上一课**：[第 0 课：infra-local 动手实践](./00-infra-local-hands-on.md)
**下一课**：[第 2 课：Runner 实体与调度算法](./02-runner-entity.md)
