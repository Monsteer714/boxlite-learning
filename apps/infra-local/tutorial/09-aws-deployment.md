# 第 9 课：AWS 云端部署 — 从单机到分布式

> **源文件**：`apps/infra/sst.config.ts` (1367 行)
> **相关文件**：`apps/infra/README.md` (402 行)
> **学习目标**：理解 BoxLite 在 AWS 上如何部署为真正的分布式系统，以及为什么 infra-local
> 的设计使本地开发与云部署行为完全一致。

## 为什么需要云端部署？

infra-local 把所有东西塞在一台 Mac 上。但生产环境需要：
- **高可用**：API 多实例，单点故障不影响服务
- **弹性伸缩**：多个 Runner，根据负载动态增减
- **数据持久性**：RDS（托管 Postgres）、S3、ElastiCache（托管 Redis）
- **安全隔离**：VPC、安全组、私有子网

## 部署框架：SST v4

SST v4 是基于 **Pulumi** 的 TypeScript IaC 框架。`sst.config.ts` 定义了整个 AWS 基础设施，
`sst deploy` 一键部署。月度成本约 **$600**（单 Runner），大头在 EC2（~$300）和 RDS（~$100）。

## 全局拓扑

```
                         Internet
                            │
                     ┌──────┴───────┐
                     │  CloudFront   │  CDN（静态 Dashboard）
                     └──────┬───────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                  ▼
   ┌────────────┐   ┌────────────┐    ┌──────────────┐
   │  API  ALB  │   │ Proxy NLB  │    │ Runner EC2   │
   │  :443/3000 │   │ :443/4000  │    │ c8i.2xlarge  │
   └─────┬──────┘   └─────┬──────┘    │ :3003        │
         │                │           └──────┬───────┘
         ▼                │                  │
   ┌──────────┐          │    BoxLite microVM boxes
   │  API     │          │    (libkrun + KVM 嵌套虚拟化)
   │ ECS      │          │
   │ Fargate  │          │
   └────┬─────┘          │
        │                │
   ┌────┴─────┐          │
   ▼          ▼          │
  RDS      ElastiCache   │
  Postgres  Redis        │
                         │
  S3 (VPC Endpoint) ◄────┘
```

## VPC 设计

```typescript
const vpc = new sst.aws.Vpc('Vpc', { nat: 'ec2' })
```

- **NAT 用 EC2**：比 NAT Gateway 便宜很多（~$5/月 vs ~$32/月）
- **私有子网**：API、Runner、RDS、Redis 都在私有子网
- **公有子网**：ALB 和 NLB 在公有子网，作为互联网入口

## 核心资源逐一解读

### API 服务（ECS Fargate，`sst.config.ts` 中段）

```typescript
const apiService = cluster.addService('ApiService', {
  cpu: '1 vCPU', memory: '2 GB',
  scaling: { min: 1, max: 4 },
  // idleTimeout 3600s — WebSocket exec attach 长连接
})
```

**为什么是 Fargate 不是 EC2？** API 无状态，serverless 自动伸缩合适，无需管理 OS。

### Runner（EC2 裸金属，`makeRunner()` 函数）

```typescript
const runner = new sst.aws.EC2('Runner', {
  instanceType: 'c8i.2xlarge',    // 8 vCPU, 16 GB, 100GB root disk
  cpuOptions: { nestedVirtualization: true },  // ← 关键！KVM 需要
  // Ubuntu 24.04, IMDSv2 1-hop
})
```

**为什么 Runner 必须是 EC2？** BoxLite microVM 需要硬件虚拟化（KVM）。Fargate 基于容器，
不支持嵌套虚拟化。`nestedVirtualization: true` 让 EC2 的 KVM 可以再嵌套一层 KVM。

### Runner 启动脚本（userData）

```bash
# 下载 runner 二进制 → 校验 SHA256 → 解压
curl -fsSL <tarball-url> -o /tmp/runner.tar.gz
echo "<sha256> /tmp/runner.tar.gz" | sha256sum -c
tar xzf /tmp/runner.tar.gz -C /usr/local/bin

# systemd 服务 (start-wrapper 从 Secrets Manager 获取 ghcr token)
systemctl enable boxlite-runner
systemctl start boxlite-runner
```

**start-wrapper 的作用**：Runner 需要 ghcr.io 凭据拉取 box 基础镜像。凭据存储在 AWS Secrets
Manager 中，start-wrapper 在启动 Runner 前先获取凭据并注入环境变量。这是 fail-closed 的——
凭据获取失败则 Runner 不启动（避免用过期凭据拉镜像导致所有 Box 创建失败）。

### 状态存储

```typescript
const db = new sst.aws.Postgres('Database', {
  instance: 't4g.micro',
  deletionProtection: isProd,   // 生产环境防止误删
})
const redis = new sst.aws.Redis('Redis', { nodeType: 'cache.t4g.micro' })
const bucket = new sst.aws.Bucket('Bucket', { versioning: true })
```

### Proxy 服务（ECS Fargate）

```typescript
// NLB（非 ALB），因为需要 TCP 层路由 + 通配符域名
const proxyService = cluster.addService('ProxyService', {
  ports: [{ listen: '443/tls', forward: '4000/tcp' }],
})
// proxy.domain + *.proxy.domain → NLB → Proxy :4000
```

### 边缘路由

```typescript
// API ALB
new sst.aws.Router('ApiRouter', { domain: 'api.STACK_DOMAIN' })

// Proxy NLB（通配符）
new sst.aws.Router('ProxyWildcard', { domain: '*.proxy.STACK_DOMAIN' })

// CloudFront CDN（/api/* 绕过 CDN 直连 ALB，避免 10 分钟 WebSocket 超时限制）
new sst.aws.CDN('Cdn', { origins: { '/api/*': apiOrigin } })
```

## 安全设计

- **Secrets Manager**：所有密钥（EncryptionKey、ProxyApiKey、AdminApiKey、RunnerApiKey）
- **S3 VPC Endpoint**：内网访问 S3，不经过公网
- **最小权限 IAM**：每个 task role 只授予所需权限
- **S3 按 orgId 前缀隔离**：API 的 S3 访问范围限定为 `organizationId` 前缀
- **Runner 的 ghcr token 是 fail-closed**：凭据过期 → 拒绝启动（而非使用过期凭据）

## 运维操作

### 滚动升级 Runner

```bash
node scripts/runner-update-binary.mjs
# 通过 SSM Run Command 在所有 Runner EC2 上执行：
#   下载新二进制 → 校验 → systemctl stop (触发优雅关闭) → 替换 → start
```

`protect: true` + `ignoreChanges: ['ami', 'userDataBase64']` 防止 SST 意外重建 Runner
（那会丢失所有运行中的 Box）。

### 注册额外 Runner

```bash
node scripts/register-runners.mjs
```

## infra-local 与 AWS 的对应关系

| 概念 | infra-local | AWS |
|---|---|---|
| API | macOS 进程 :3001 | ECS Fargate :3000 (ALB :443) |
| Runner | macOS 进程 :3003 | EC2 c8i.2xlarge :3003 |
| Proxy | macOS 进程 :4000 | ECS Fargate :4000 (NLB :443) |
| DB | Postgres box :25432 | RDS t4g.micro |
| 缓存 | Redis box :26379 | ElastiCache |
| 对象存储 | MinIO box :29000 | S3 + VPC Endpoint |
| OIDC | Dex box :25556 | 外部 Provider |
| 统一入口 | Caddy box :28080 | CloudFront + ALB + NLB |

**API 代码不需要知道它在哪运行**—— 无论 infra-local 还是 AWS，Runner 都是通过 Job 队列
通信，Postgres 都是通过连接串访问，Redis 都是通过 host:port 连接。

---

**上一课**：[第 8 课：Proxy 端口路由](./08-proxy-routing.md)
**下一课**：[第 10 课：BoxLite Engine 内核](./10-boxlite-engine.md)
