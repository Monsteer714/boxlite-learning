# 第 7 课：Poller + Executor — Job 拉取与执行

> **源文件**：
> - `apps/runner/pkg/runner/v2/poller/poller.go` (124 行)
> - `apps/runner/pkg/runner/v2/executor/executor.go` (266 行)
> **学习目标**：理解 Runner 如何拉取 Job、执行 Job、以及 W3C 分布式追踪在两者间的传播。

## 架构概览

```
PollerService.Start(ctx)
  │
  ├─ 启动时：拉取所有 IN_PROGRESS Job → 恢复执行（断点续传）
  │
  └─ 主循环：
       pollJobs(ctx)
         └─ GET /runner/jobs/poll?timeout=30&limit=10
              └─ API: pollJobs() (见第 5 课)
                   ├─ claimPendingJobs (DB 原子认领)
                   ├─ Redis BRPOP (阻塞等待)
                   └─ DB 兜底
       │
       └─ 每个 Job → go executor.Execute(ctx, &job)
```

## PollerService — Job 轮询器

### 启动时恢复（第 53-66 行）

```go
func (s *Service) Start(ctx context.Context) {
    // 先拉取所有 IN_PROGRESS 的 Job
    inProgressJobs, _, err := s.client.JobsAPI.ListJobs(ctx).
        Status(apiclient.JOBSTATUS_IN_PROGRESS).Execute()
    if len(inProgressJobs.Items) > 0 {
        for _, job := range inProgressJobs.Items {
            go s.executor.Execute(ctx, &job)  // 并发恢复
        }
    }
    // 然后进入主循环...
```

**为什么启动时要恢复 IN_PROGRESS Job？**

Runner 可能在上一次运行时崩溃了。重启后，有些 Job 的状态还卡在 IN_PROGRESS（因为没来得及上报
COMPLETED/FAILED）。恢复执行这些 Job 可以继续未完成的工作。

⚠️ 注意：Job 的 execute 操作（如 `CREATE_BOX`）本身应该是幂等的。`blclient.Create()` 内部使用
`get_or_create`，如果 Box 已经存在就返回已有的，不会重复创建。

### 主轮询循环（第 70-94 行）

```go
for {
    select {
    case <-ctx.Done():
        return                    // Runner 关闭
    default:
        jobs, err := s.pollJobs(ctx)
        if err != nil {
            time.Sleep(5 * time.Second)  // 错误退避
            continue
        }
        for _, job := range jobs {
            go s.executor.Execute(ctx, &job)  // 并发执行
        }
    }
}
```

每个 Job 在独立的 goroutine 中执行，不阻塞后续 polling。

### pollJobs 的 HTTP 调用（第 98-123 行）

```go
func (s *Service) pollJobs(ctx context.Context) ([]apiclient.Job, error) {
    resp, httpResp, err := req.Execute()
    if httpResp != nil && httpResp.StatusCode == 408 {
        return []apiclient.Job{}, nil  // 超时是正常的（长轮询）
    }
    ...
}
```

`408 Request Timeout` 是长轮询的正常终点 —— API 的 `pollJobs()` 在 30 秒内没有新 Job 就返回 408。
Poller 收到 408 后立即发起下一次 poll，保持近乎实时的响应。

## Executor — Job 执行器

### Execute() 主流程（第 58-105 行）

```go
func (e *Executor) Execute(ctx context.Context, job *apiclient.Job) {
    // 1. 从 Job 中提取 W3C traceContext → 延续分布式追踪
    ctx = e.extractTraceContext(ctx, job)

    // 2. 执行 Job
    resultMetadata, err := e.executeJob(ctx, job)

    // 3. 上报结果到 API
    status := apiclient.JOBSTATUS_COMPLETED / apiclient.JOBSTATUS_FAILED
    e.updateJobStatus(ctx, job.GetId(), status, resultMetadata, errorMessage)
}
```

### 分布式追踪传播（第 230-265 行）

```go
func (e *Executor) extractTraceContext(ctx context.Context, job *apiclient.Job) context.Context {
    // job.traceContext = {"traceparent": "00-<trace>-<span>-01", ...}
    carrier := make(propagation.MapCarrier)
    for k, v := range job.GetTraceContext() {
        carrier[k] = v.(string)
    }
    // W3C TraceContext 标准的 propagator
    propagator := propagation.TraceContext{}
    ctx = propagator.Extract(ctx, carrier)
    return ctx
}
```

这是分布式追踪的关键桥梁。API 在 `createJob()` 时把当前的 OpenTelemetry span context 序列化到
`job.traceContext`。Runner 在执行前 `Extract` 出来，创建一个 child span。这样 Jaeger 中就能看到
一条完整的 trace：`API → Job 创建 → Runner 拉取 → Runner 执行 → Box 内部操作`。

### executeJob() 分发（第 108-158 行）

```go
func (e *Executor) executeJob(ctx context.Context, job *apiclient.Job) (any, error) {
    // 创建 OpenTelemetry span
    ctx, span := tracer.Start(ctx, fmt.Sprintf("execute_%s", job.GetType()))
    defer span.End()

    switch job.GetType() {
    case apiclient.JOBTYPE_CREATE_BOX:
        return e.createBox(ctx, job)
    case apiclient.JOBTYPE_START_BOX:
        return e.startBox(ctx, job)
    case apiclient.JOBTYPE_STOP_BOX:
        return e.stopBox(ctx, job)
    case apiclient.JOBTYPE_DESTROY_BOX:
        return e.destroyBox(ctx, job)
    case apiclient.JOBTYPE_RECOVER_BOX:
        return e.recoverBox(ctx, job)
    case apiclient.JOBTYPE_UPDATE_BOX_NETWORK_SETTINGS:
        return e.updateNetworkSettings(ctx, job)
    default:
        return nil, fmt.Errorf("unknown job type: %s", job.GetType())
    }
}
```

每个 `createBox` / `startBox` 等方法的具体实现在 `executor/box.go` 中。它们都遵循同样的模式：
1. `parsePayload` — 从 JSON 解析 Job 的 payload
2. 调用 `backend.BoxBackend` 接口方法（实现是 `boxlite_adapter.go`）
3. 返回 resultMetadata 或 error

### updateJobStatus() 的重试机制（第 161-213 行）

```go
err := utils.RetryWithExponentialBackoff(ctx, ...,
    func() error {
        _, httpResp, err := req.Execute()
        if httpResp.StatusCode >= 400 && httpResp.StatusCode < 500 {
            return &utils.NonRetryableError{...}  // 4xx 不重试
        }
        return err  // 5xx 或网络错误 → 重试
    },
)
```

关键设计：
- **4xx 不重试**：如果 API 返回 400（状态转换非法）或 409（乐观锁冲突），重试没有意义
- **5xx 重试**：API 暂时不可用，退避重试
- **指数退避**：`utils.DEFAULT_BASE_DELAY` → 每次翻倍 → 最多 `DEFAULT_MAX_DELAY`

## createBox 的执行（executor/box.go 节选）

```go
func (e *Executor) createBox(ctx context.Context, job *apiclient.Job) (any, error) {
    var dto dto.CreateBoxDTO
    e.parsePayload(job.GetPayload(), &dto)

    startResp, err := e.backend.Create(ctx, &dto)
    // backend.Create → boxlite_adapter.Create() → blclient.Create()
    //   → BoxLite Go SDK → C FFI → BoxliteRuntime.create()
    //     → 拉取镜像 → 创建 rootfs → 启动 libkrun microVM

    return StartBoxResponse{DaemonVersion: startResp.DaemonVersion}, err
}
```

## 关键设计思想

1. **启动恢复 + 持续轮询**：Poller 启动时先恢复 IN_PROGRESS Job（崩溃恢复），然后进入长轮询循环。
   这保证了即使 Runner 崩溃重启，也不会丢失正在执行的 Job。

2. **并发执行，串行认领**：Poller 拿到多个 Job 后，每个 Job 一个 goroutine 并发执行。
   但认领（`claimPendingJobs`）是串行的，通过乐观锁保证同一 Job 只被一个 Runner 认领。

3. **W3C TraceContext 端到端传播**：API → Job.traceContext → Runner.Extract → Box 环境变量
   `BOXLITE_TRACEPARENT`。一整条 trace 横跨三个进程。

4. **区分可重试和不可重试错误**：`NonRetryableError` 包装器让重试逻辑对调用方透明。

---

**上一课**：[第 6 课：Runner 启动与组件装配](./06-runner-bootstrap.md)
**下一课**：[第 8 课：Proxy 端口路由](./08-proxy-routing.md)
