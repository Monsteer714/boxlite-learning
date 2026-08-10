# 第 0 课：infra-local — 从零搭建本地开发环境

> **学习目标**：把完整的 BoxLite 控制平面在本地跑起来，理解 L1/L2 双层架构。
> 预计时长：首次 30-40 分钟（含编译），后续 < 1 分钟。

## 为什么从这里开始？

infra-local 在单台 Mac 上完整复现了云端分布式系统的**服务拓扑和交互协议**。
API 不知道 Runner 是本机进程还是远端 EC2 —— 对 API 来说 Runner 就是 HTTP endpoint + Job 队列。
你在这里改的代码，部署到 AWS 后行为完全一致。

## 前置条件

- Apple Silicon Mac (M1/M2/M3/M4)，macOS 14+
- 建议 ≥ 16 GB 内存

```bash
# 确保这些工具已安装
xcode-select --install                    # git, cc, make
brew install go libpq                     # Go 1.25+, psql
brew install gh                           # GitHub CLI (可选，自动获取 ghcr 凭据)
corepack enable                           # Node + Yarn
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh  # Rust
```

## 启动流程

```bash
git clone https://github.com/boxlite-ai/boxlite.git
cd boxlite
git submodule update --init --recursive    # libkrun, e2fsprogs 等
cd apps/infra-local
make up                                    # 唯一需要的命令
```

### `make up` 做了什么？（5 个阶段）

**阶段 0：Apple Silicon 自举**
- 自动创建 venv，安装 compose 包
- 编译 BoxLite 原生库（`libboxlite.a`，首次 10-30 分钟，后续秒级）
- 获取 Docker Hub / ghcr.io 凭据

**阶段 1：拉起 L1（11 个 BoxLite microVM）**
- 按拓扑排序分层启动，每层内并行
- Layer 0: postgres, redis, minio, registry (并行)
- Layer 1: dex, jaeger, minio-init
- Layer 2: pgadmin, registry-ui, otel
- Layer 3: caddy (等所有上游)
- 每个 box 启动后等健康检查通过才进入下一层

**阶段 2：构建 L2 Go 二进制** (`runner`, `proxy`)

**阶段 3：配置 API 环境**（从 `api.env` 模板复制 → `apps/api/.env`）

**阶段 4：启动 L2 进程**（`api → runner → proxy → dashboard`），每个等健康信号

**阶段 5：Seed 数据**（等 API 自举 admin 用户 + org + region，runner 注册）

## 验证

```bash
make status           # L1 + L2 全部健康
open http://localhost:3000    # Dashboard
# 登录: admin@boxlite.dev / password
```

## 基础设施服务速查

| 服务 | 地址 | 凭据 |
|---|---|---|
| Postgres | `psql -h 127.0.0.1 -p 25432 -U boxlite -d boxlite` | boxlite/boxlite |
| Redis | `redis-cli -p 26379 PING` | — |
| MinIO | http://127.0.0.1:29001 | minioadmin/minioadmin |
| Jaeger | http://127.0.0.1:26686 | — |
| Registry | http://127.0.0.1:25000/v2/ | — |

## 常用命令

| 命令 | 作用 |
|---|---|
| `make up` | 一键拉起（幂等） |
| `make status` | 查看健康 |
| `make down` | 停 L2 (L1 保留) |
| `make down ARGS=--all` | 停 L2 + 移除 L1 |
| `make restart COMPONENTS=api` | 重启指定组件 |
| `make logs COMPONENT=api` | 看日志 |
| `make reset` | 清除运行时数据 |
| `make nuke` | 毁灭一切 |

## 两层架构速览

```
L2: 4 个 macOS 原生进程 (subprocess 管理)
  API(:3001, NestJS)  Runner(:3003, Go)  Proxy(:4000, Go)  Dashboard(:3000, Vite)

L1: 11 个 BoxLite microVM Box (BoxLite SDK 管理)
  postgres  redis  minio  registry  dex  jaeger
  pgadmin  registry-ui  otel-collector  caddy  minio-init(一次性)
```

## 本地 vs 云端对照

| 概念 | infra-local | AWS 云端 |
|---|---|---|
| DB | Postgres box | RDS |
| 缓存 | Redis box | ElastiCache |
| 对象存储 | MinIO box | S3 |
| OIDC | Dex box | 外部 Provider |
| API | macOS 进程 | ECS Fargate |
| Runner | macOS 进程 | EC2 c8i.2xlarge |
| Proxy | macOS 进程 | ECS Fargate |

---

**下一步**：[第 1 课：Box 实体 — 微虚拟机的数据模型](./01-box-entity.md)
