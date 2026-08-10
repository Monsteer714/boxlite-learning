# 第 8 课：Proxy 端口路由 — 从 URL 到 Box 内部网络

> **源文件**：
> - `apps/proxy/pkg/proxy/proxy.go` (294 行)
> - `apps/proxy/pkg/proxy/get_box_target.go` (451 行)
> - `apps/proxy/pkg/proxy/tunnel.go`
> **学习目标**：理解 Proxy 如何将 `{port}-{boxId}.domain` 的请求路由到正确的 Runner 和 Box 端口。

## Proxy 是什么？

Proxy 是 BoxLite 的**边缘路由器**。它不做业务逻辑，只做一件事：
**把 `{port}-{boxId}.proxy.domain` 的 HTTP 请求转发到对应 Box 内部的端口。**

类比：Kubernetes Ingress Controller + Service Mesh 的结合体。

## 请求路由全景

```
用户浏览器
  │  Host: 8080-box123.proxy.boxlite.dev
  ▼
Proxy (:4000)
  │
  ├─ parseHost("8080-box123.proxy.boxlite.dev")
  │   → targetPort = "8080", boxId = "box123"
  │
  ├─ getBoxPublic(boxId)
  │   是 public 且非 terminal 端口？ → 跳过认证
  │   否则 → Authenticate() 验证签名 token / OIDC JWT
  │
  ├─ terminal 端口 (22222)？
  │   │ 是 → getBoxRunnerInfo() → HTTP 代理到 runner.ApiUrl
  │   │
  │   └─ 否 → 构造目标 URL: http://<boxId>:<port>/<path>
  │           Transport: guestPortTransport
  │             └─ dialGuestPort(boxId, port)
  │                  ├─ getBoxRunnerInfo(boxId) → 问 API "Box 在哪？"
  │                  └─ dialRunnerTunnel(runnerInfo, boxId, port)
  │                       └─ HTTP CONNECT /v1/boxes/<id>/network/tunnel?port=<port>
  │                            └─ Runner → gvproxy → Box 内部 :port
  │
  └─ 后台：go updateLastActivity(boxId)  # 50s 一次心跳
```

## 分步详解

### 1. Host 解析（`parseHost`，第 341-377 行）

```go
// 输入: "8080-box123.proxy.boxlite.dev"
parts := strings.Split(host, ".")          // ["8080-box123", "proxy", "boxlite", "dev"]
hostPrefix := parts[0]                     // "8080-box123"
targetPort, boxId, _ := strings.Cut(hostPrefix, "-")
// targetPort = "8080", boxId = "box123"
```

### 2. Direct Preview Box ID 解码

```go
// 输入: "d-626f78313233" (hex 编码的 box ID)
decoded := hex.DecodeString("626f78313233")  // → "box123"
```

某些 Box ID 包含特殊字符不适合放 URL，用 `d-<hex>` 前缀编码。

### 3. 认证决策（第 74-88 行）

```go
if !*isPublic || targetPort == TERMINAL_PORT {
    boxId, didRedirect, err = p.Authenticate(ctx, boxIdOrSignedToken, port)
}
```

- **Public Box + 非 terminal** → 无需认证
- **Private Box 或 Terminal (22222)** → 验证签名 token 或 OIDC Bearer token

### 4. Terminal 端口特殊处理（第 121-149 行）

```go
if targetPort != TERMINAL_PORT {
    // 普通端口：走 HTTP CONNECT 隧道
} else {
    // Terminal (22222)：HTTP 代理到 Runner
    target = fmt.Sprintf("%s/boxes/%s/toolbox/proxy/%s%s",
        runnerInfo.ApiUrl, boxId, targetPort, targetPath)
    // 携带 Runner API key
    headers["X-BoxLite-Authorization"] = "Bearer " + runnerInfo.ApiKey
}
```

Terminal 走 HTTP 代理而非 CONNECT 隧道，是因为 WebSocket（exec attach）需要 HTTP Upgrade。

### 5. getBoxRunnerInfo() — 找到 Runner（第 198-235 行）

```go
func (p *Proxy) getBoxRunnerInfo(ctx context.Context, boxId string) (*RunnerInfo, error) {
    // 1. 缓存命中 → 直接返回
    // 2. API: GET /runners/by-box/<boxId> → Runner.apiUrl + Runner.apiKey
    // 3. 缓存 2 分钟
}
```

**缓存必要性**：无缓存时每次端口请求都要调 API。2 分钟 TTL = 同一 Box 的连续请求直接命中缓存。

### 6. dialRunnerTunnel — HTTP CONNECT 隧道

```
Proxy → Runner:
  CONNECT /v1/boxes/<boxId>/network/tunnel?port=<port> HTTP/1.1
  X-BoxLite-Authorization: Bearer <runnerApiKey>

Runner → gvproxy → Box 内部 :port
  TCP 双向字节流透明转发
```

### 7. 活动时间更新（第 414-451 行）

```go
go p.updateLastActivity(activityCtx, boxId, true, controller.done)
// 每 50s 调一次 API: POST /boxes/<id>/last-activity
// 用于 autoStop：Box 长时间无访问 → 自动停止
```

## Proxy 缓存体系

| 缓存 | 用途 | TTL | 为什么是这个值 |
|---|---|---|---|
| `boxRunnerCache` | Box → Runner 映射 | 2 min | Runner 分配后很少变 |
| `boxPublicCache` | Box 是否 public | 3 sec | 用户可能实时切换 |
| `boxAuthKeyValidCache` | 签名 token 有效性 | 2 min | 签名 token 过期时间长 |
| `boxLastActivityUpdateCache` | 去重活动更新 | 45 sec | 50s 间隔 - 5s buffer |

## 关键设计思想

1. **无状态 Proxy**：不持有持久化数据，可水平扩展
2. **两层路由**：URL → Runner（问 API）→ Box 端口（CONNECT 隧道）。Proxy 不了解 Runner 网络拓扑
3. **Terminal vs 普通端口的协议差异**：Terminal 需要 HTTP Upgrade（WebSocket），走 HTTP 代理；
   普通端口走 CONNECT 隧道（原始 TCP），性能更好
4. **安全认证隔离**：`X-BoxLite-Authorization` 只含 Runner API key。Runner 信任 Proxy 已完成
   用户认证，Proxy 信任 API 的 Runner 信息

---

**上一课**：[第 7 课：Poller + Executor](./07-runner-poller-executor.md)
**下一课**：[第 9 课：AWS 云端部署](./09-aws-deployment.md)
