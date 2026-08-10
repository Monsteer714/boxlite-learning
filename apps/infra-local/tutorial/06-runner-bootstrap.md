# 第 6 课：Runner 启动与组件装配

> **源文件**：`apps/runner/cmd/runner/main.go` (257 行)
> **学习目标**：理解 Runner 从启动到就绪的完整初始化流程，以及各组件如何装配。

## Runner 是什么？

Runner 是 BoxLite 唯一的**计算节点**——一个 Go 进程，运行在 EC2（云端）或 macOS（本地）。
它负责：拉取 API 的 Job → 驱动 BoxLite Engine 创建 microVM → 上报健康状态。

## main.go 逐段解析

### 1. 日志初始化（第 39-43 行）

```go
logger := slog.New(tint.NewHandler(os.Stdout, &tint.Options{
    NoColor:    !isatty.IsTerminal(os.Stdout.Fd()),
    TimeFormat: time.RFC3339,
    Level:      log.ParseLogLevel(os.Getenv("LOG_LEVEL")),
}))
```

使用 `tint` handler —— 结构化日志 + 彩色终端输出。生产环境 JSON，开发环境人性化。
Go 1.21+ 的 `slog` 是标准库的一部分。

### 2. 配置加载（第 47 行）

```go
cfg, err := config.GetConfig()
```

`config.GetConfig()` 使用 `envconfig` 库，将环境变量映射到 Go struct。关键字段：
`BOXLITE_API_URL`, `BOXLITE_RUNNER_TOKEN`, `API_PORT` (3003), `API_VERSION` ("2"),
`BOXLITE_HOME_DIR`, `POLL_TIMEOUT` (30s), `POLL_LIMIT` (10), `HEALTHCHECK_INTERVAL` (30s)

### 3. OpenTelemetry 初始化（第 56-95 行）

```go
// 日志导出到 OTLP
telemetry.InitLogger(ctx, logger, telemetryConfig)

// 追踪导出到 OTLP
telemetry.InitTracer(ctx, telemetryConfig, &filters.NotFoundExporterFilter{})
```

Tracker 加了一个 `NotFoundExporterFilter` —— 过滤掉 404 的 span，减少噪音。

### 4. BoxLite Client 初始化（第 107-127 行）

```go
boxliteClient, err := blclient.NewClient(ctx, blclient.ClientConfig{
    HomeDir:            cfg.BoxliteHomeDir,    // /var/lib/boxlite
    InsecureRegistries: insecureRegs,           // 本地 registry
    GhcrUsername:       cfg.GhcrUsername,       // ghcr.io 凭据
    DockerHubUsername:  cfg.DockerHubUsername,   // docker.io 凭据
    ...
})
defer boxliteClient.Close()
```

`blclient.NewClient` 是 BoxLite Go SDK 的入口。它：
1. 初始化 `BoxliteRuntime` 单例（进程级，管理所有 Box）
2. 配置镜像拉取的认证
3. 设置 Box 的存储目录

`Close()` 做优雅关闭：停止所有运行中的 Box，释放锁文件。

### 5. 内部服务初始化（第 131-158 行）

```go
// Box 服务：提供本地 Box 的 CRUD
boxService := services.NewBoxService(logger, boxliteClient)

// Box 状态同步：10s 一次，比对本地的 box 状态和 API 记录的状态
boxSyncService := services.NewBoxSyncService(...)
boxSyncService.StartSyncProcess(ctx)

// 指标收集器：定期采样 CPU/内存/磁盘使用率
metricsCollector := metrics.NewCollector(...)
metricsCollector.Start(ctx)

// Runner 单例：全局 Runner 实例（持有上述所有服务）
runner.GetInstance(&runner.RunnerInstanceConfig{...})
```

**BoxSyncService** 的状态对账流程（`services/box_sync.go`）：
1. 本地 `boxlite.ListInfo()` → 拿到所有本地 Box 的状态
2. API `GET /boxes?states=STARTED&skipReconcilingBoxes=true` → 拿到 API 认为应该跑在本 Runner 上的 Box
3. 比对差异 → 调 API `UpdateBoxState` 修正

### 6. v2 组件装配（第 162-209 行）

```go
if cfg.ApiVersion == 2 {
    // 健康检查服务 (30s 一次)
    healthcheckService := healthcheck.NewService(...)
    go healthcheckService.Start(ctx)

    // Job 执行器
    executorService := executor.NewExecutor(...)

    // Job 轮询器
    pollerService := poller.NewService(...)
    go pollerService.Start(ctx)
}
```

这三个 goroutine 是 v2 Runner 的核心运行循环。

### 7. API Server 启动（第 211-226 行）

```go
apiServer := api.NewApiServer(api.ApiServerConfig{
    ApiPort:  cfg.ApiPort,     // 3003
    ApiToken: cfg.ApiToken,    // 与 API 通信的 Bearer token
    ...
})
go func() { apiServerErrChan <- apiServer.Start(ctx) }()
```

Gin HTTP server，提供：
- `GET /health` — 健康检查
- `POST /boxes` — API 直接调用（v0 兼容 + 少量 v2 管理端点）
- `/v1/boxes/:id/exec` — 执行命令
- `/v1/boxes/:id/network/tunnel` — Proxy 的端口隧道

### 8. 优雅关闭（第 228-255 行）

```go
select {
case err := <-apiServerErrChan:
    return 1                          // API server 挂了 → 退出
case <-interruptChannel:              // SIGTERM / SIGINT
    // 1. 先停 Box（25s 超时）
    boxliteClient.Shutdown(shutdownCtx, 25*time.Second)
    // 2. 再停 API server
    apiServer.Stop()
    return 143  // 128 + 15 (SIGTERM)
}
```

**关闭顺序很重要**：先停 Box 再停 API server。原因：
- Box 的 microVM 写磁盘时需要干净关闭（否则 rootfs 可能损坏）
- systemd 的 `TimeoutStopSec=90s`，这里有 25s 预算给 Box 关闭，剩余时间给 HTTP 请求完成
- 退出码 143 = 被 SIGTERM 杀死（告诉 systemd 这是正常关闭）

## 组件装配全景图

```
main()
 │
 ├─ slog + tint handler                # 结构化日志
 ├─ config.GetConfig()                 # 环境变量 → 配置
 ├─ telemetry.InitLogger/InitTracer    # OTLP 导出
 │
 ├─ blclient.NewClient()               # BoxLite Go SDK 初始化
 │   └─ BoxliteRuntime (C FFI → Rust 核心)
 │
 ├─ BoxService / BoxSyncService        # Box 本地管理 + 状态对账
 ├─ MetricsCollector                   # CPU/内存/磁盘采样
 ├─ runner.GetInstance()               # Runner 单例
 │
 ├─ [v2 only]
 │   ├─ HealthcheckService             # 30s 一次健康上报
 │   ├─ Executor                       # Job 执行分发
 │   └─ PollerService                  # 长轮询 Job
 │
 ├─ ApiServer (Gin :3003)             # HTTP API
 │
 └─ select { server err | SIGTERM }    # 优雅关闭
```

## 关键设计思想

1. **单例 Runner**：`runner.GetInstance()` 保证进程中只有一个 Runner 实例，持有 BoxLite runtime
   的唯一引用。这防止了多实例共享 `BOXLITE_HOME_DIR` 导致的锁冲突。

2. **goroutine 并发模型**：Go 的 goroutine 轻量且安全，Runner 同时运行着 5+ 个后台 goroutine
   （poller, healthcheck, sync, metrics, api server），每个都有独立的 `context.Context` 控制生命周期。

3. **优雅关闭的两阶段**：先业务（Box）后基础设施（API server）。关闭超时用 context.WithTimeout
   硬限制，防止卡死。

4. **envconfig 做配置**：所有配置来自环境变量，无配置文件。12-factor app 风格，方便容器化部署。

---

**上一课**：[第 5 课：Job 队列系统](./05-job-service-queue.md)
**下一课**：[第 7 课：Poller + Executor](./07-runner-poller-executor.md)
