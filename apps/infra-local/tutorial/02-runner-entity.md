# 第 2 课：Runner 实体与 TOPSIS 调度算法

> **源文件**：`apps/api/src/box/entities/runner.entity.ts` (219 行)
> **相关文件**：`apps/api/src/box/services/runner.service.ts` (954 行，调度核心)
> **学习目标**：理解 Runner 的数据模型、状态机和调度评分系统。

## Runner 是什么？

Runner 是 BoxLite 的**计算节点**——运行 BoxLite Engine 的物理机（云端是 EC2，本地是 macOS 进程）。
类比 Kubernetes 的 Kubelet：接收控制平面指令，在本地创建/管理 Pod（Box）。

## 字段分组解读

### 标识与网络

```typescript
@PrimaryGeneratedColumn('uuid')
id: string

@Column({ nullable: true })
domain: string | null          // IP 或域名，如 "10.0.1.5"

@Column({ nullable: true })
apiUrl: string | null          // Runner HTTP API 地址，如 "http://10.0.1.5:3003"

@Column({ nullable: true })
proxyUrl: string | null        // Proxy 服务地址（给 Proxy 组件用的）
```

`apiUrl` 和 `proxyUrl` 在 v0（旧版）中必须非空，因为 API 需要直接 HTTP 调用 Runner。
在 v2（新版）中可以为空 —— API 不再直接调 Runner，而是通过 Job 队列通信。

### 安全

```typescript
@Column()
apiKey: string                 // Runner 与 API 通信的 Bearer token
```

API 在创建 Runner 时生成 `apiKey`（带前缀，如 `blr_xxxx`）。Runner 在所有 API 调用中携带此 key。

### 硬件资源

```typescript
cpu: number          // 总 CPU 核数，如 8 (c8i.2xlarge)
memoryGiB: number    // 总内存，如 16
diskGiB: number      // 总磁盘，如 100
gpu: number | null   // GPU 数量
gpuType: string | null // GPU 类型
class: BoxClass      // 服务等级
```

### 实时使用量（Runner 健康上报时更新）

```typescript
currentCpuLoadAverage: number          // 当前负载
currentCpuUsagePercentage: number      // CPU 使用率 %
currentMemoryUsagePercentage: number   // 内存使用率 %
currentDiskUsagePercentage: number     // 磁盘使用率 %
currentAllocatedCpu: number            // 已分配 CPU
currentAllocatedMemoryGiB: number      // 已分配内存
currentAllocatedDiskGiB: number        // 已分配磁盘
currentStartedBoxes: number            // 当前运行的 Box 数量
```

这些字段由 Runner 每 30 秒通过健康检查上报，API 用它们计算 `availabilityScore`。

### 调度评分

```typescript
@Column({ default: 0 })
availabilityScore: number       // 可用性评分 (TOPSIS 算法)
```

**这是整个调度系统的核心**。`availabilityScore` 是一个 0-1 之间的浮点数，越高 = 越适合调度。

### 状态

```typescript
@Column({ type: 'enum', enum: RunnerState, default: RunnerState.INITIALIZING })
state: RunnerState

@Column({ default: false })
unschedulable: boolean          // 管理员标记为不可调度

@Column({ default: false })
draining: boolean               // 正在排空中（不再接受新 Box）
```

**RunnerState 状态流转**：
```
INITIALIZING → REGISTERING → READY → (60s 无心跳) → UNRESPONSIVE
                                  → DRAINING → 排空后下线
```

### API 版本

```typescript
@Column({ default: '0' })
apiVersion: string              // '0' (同步 HTTP) 或 '2' (异步 Job 队列)
```

`apiVersion` 决定了 API 如何与 Runner 通信：
- `'0'`：API 直接 HTTP 调用 Runner 端点（`RunnerAdapterV0`）
- `'2'`：API 创建 Job，Runner 长轮询拉取（`RunnerAdapterV2`）

### 其他

```typescript
@Column({ nullable: true })
appVersion: string | null       // Runner 二进制版本号

@Column({ nullable: true, type: 'timestamp with time zone' })
lastChecked: Date               // 最后一次健康检查时间

@Column({ type: 'jsonb', nullable: true })
serviceHealth: RunnerServiceInfo[] | null  // 各子服务健康状态
```

## 调度算法：TOPSIS

`runnerService.calculateTOPSISScore()` 实现了 **TOPSIS**（Technique for Order Preference by Similarity to Ideal Solution），一种多准则决策算法。

### 输入指标

| 指标 | 方向 | 说明 |
|---|---|---|
| CPU 使用率 | 越低越好 | currentCpuUsagePercentage |
| 内存使用率 | 越低越好 | currentMemoryUsagePercentage |
| 磁盘使用率 | 越低越好 | currentDiskUsagePercentage |
| 已运行的 Box 数量 | 越低越好 | currentStartedBoxes |

### 计算步骤

1. **归一化**：将各指标转为同量纲
2. **加权**：CPU 和内存权重较高（直接影响 Box 启动速度）
3. **计算理想解距离**：每个 Runner 与"最佳 Runner"（全 0 使用率）和"最差 Runner"（全 100%）的加权欧氏距离
4. **评分** = 到最差解的距离 / (到最佳解的距离 + 到最差解的距离)

⚠️ 注：以上是 TOPSIS 的经典描述。实际代码中 RunnerService 的具体实现可能有额外的指数惩罚项
（对高负载 Runner 施加更陡峭的惩罚曲线）。

### 调度流程

```
getRandomAvailableRunner({ regions, boxClass })
  │
  ├─ 过滤: state=READY, !unschedulable, !draining, region 匹配, class 匹配
  │
  ├─ 过滤: availabilityScore ≥ threshold
  │         (默认 threshold, infra-local 放宽为 5 以适应 M5 Mac)
  │
  ├─ 排序: availabilityScore DESC
  │
  ├─ 取 top 10
  │
  └─ 随机选 1 个  ← 避免总是选中"最空闲的"导致热点
```

取 top 10 随机选取是一种简单的**负载分散**策略：避免所有请求打向同一个"最佳" Runner。

## 数据库索引

```sql
@Unique(['region', 'name'])                        -- 区域 + 名称唯一
@Index(['state', 'unschedulable', 'region'])       -- 调度查询的核心索引
```

`@Index(['state', 'unschedulable', 'region'])` 直接对应 `getRandomAvailableRunner` 的 WHERE 条件。

## Runner 构造函数中的版本逻辑

```typescript
constructor(params) {
  // ...
  if (this.apiVersion === '0') {
    if (!this.apiUrl) throw new Error('API URL is required for runner version 0')
    if (!this.proxyUrl) this.proxyUrl = this.apiUrl  // 默认 proxyUrl = apiUrl
  }
}
```

v0 Runner 必须有 `apiUrl`（API 直接调它），v2 则不需要。

---

**上一课**：[第 1 课：Box 实体](./01-box-entity.md)
**下一课**：[第 3 课：Job 实体与乐观锁](./03-job-entity.md)
