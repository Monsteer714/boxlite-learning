# `apps/infra-local/` 概览

## 这是什么？

`infra-local` 是 BoxLite 项目的**本地开发栈编排器**。它在单台 Apple Silicon Mac 上用 BoxLite 自己的
SDK 把整个云端控制平面拉起来 —— 真正"吃自己的狗粮"（dogfooding）。

一句话：**一个 Python 包（`compose`）驱动两层基础设施，给你一个完整的本地开发环境。**

## 两层架构

```
┌──────────────────────────────────────────────────────┐
│  L2 — 4 个原生 macOS 进程 (subprocess 管理)           │
│  API(:3001)  Runner(:3003)  Proxy(:4000)  Dashboard  │
│  NestJS       Go             Go            Vite      │
├──────────────────────────────────────────────────────┤
│  L1 — 11 个 BoxLite microVM Box (BoxLite SDK 管理)    │
│  postgres  redis  minio  registry  dex  jaeger       │
│  pgadmin   registry-ui  otel-collector  caddy        │
│  + minio-init (一次性 bootstrap)                      │
└──────────────────────────────────────────────────────┘
```

### L1 — BoxLite 微虚拟机层

11 个 Box 跑在 BoxLite 轻量级 microVM 里，每个都是一个完整的 OCI 容器。由 `orchestrator.py` +
`services.py` 管理生命周期。

| Box | 镜像 | 宿主机端口 | 作用 |
|---|---|---|---|
| postgres | `postgres:17-alpine` | 25432 | 主数据库，匹配 prod RDS 17.9 |
| redis | `redis:7-alpine` | 26379 | 缓存 / 会话存储 |
| minio | `minio/minio:latest` | 29000 / 29001 | S3 兼容对象存储 + 管理控制台 |
| minio-init | `minio/mc:latest` | — | 一次性任务：创建 `boxlite` bucket 后退出 |
| registry | `registry:2` | 25000 | Docker 镜像仓库 |
| dex | `dexidp/dex:v2.42.0` | 25556 | OIDC 身份认证 |
| jaeger | `jaegertracing/all-in-one:1.67.0` | 26686 / 26687 | 分布式追踪 UI + OTLP 接收 |
| pgadmin | `dpage/pgadmin4:9.2.0` | 25051 | PostgreSQL 管理界面 |
| registry-ui | `joxit/docker-registry-ui:main` | 25052 | 镜像仓库 Web UI |
| otel-collector | `otel/opentelemetry-collector` | 24317 / 24318 / 23133 | 遥测数据接收与转发（→ jaeger） |
| caddy | `caddy:2-alpine` | 28080 | 统一反向代理入口 |

Box 之间通过拓扑排序按依赖关系启动（例如 minio-init 等 minio 就绪后才跑，caddy 等所有上游就绪后才启动）。
健康检查分两种：`exec`（在 box 内执行命令，如 `pg_isready`）和 `http_url`（宿主机 HTTP 探测）。

Box 内部通过 `host.boxlite.internal`（gvproxy DNS）访问宿主机端口，与宿主机上的 L2 进程通信。

### L2 — 原生宿主机进程层

4 个 macOS 原生进程由 `native.py` 管理，通过 `subprocess.Popen(start_new_session=True)` 以
detach 模式启动，通过 pidfile + 进程组信号（SIGTERM → SIGKILL）优雅停止。

| 进程 | 端口 | 技术栈 | 说明 |
|---|---|---|---|
| api | 3001 | NestJS (Node) | 核心 API 服务，TypeORM + PostgreSQL |
| runner | 3003 | Go | Box 运行时执行器，调用 BoxLite SDK 原生库 |
| proxy | 4000 | Go | 端口预览代理，OIDC 鉴权 + Redis 缓存 |
| dashboard | 3000 | Vite (React) | 前端开发服务器，`/api` 代理到 API |

`native.py` 的 `up()` 是所有操作的入口：自动安装依赖 → 构建 Go 二进制 → 拉起 L1 → 启动 L2 →
seed 初始数据。每一步都是幂等的，缺失才做。

## 配置设计

`InfraConfig`（`compose/config.py`）是**唯一配置真相源**。一个 `@dataclass`，字段分三类：

- **凭据**：pg / minio / pgadmin 的用户名密码，可通过 `BOXLITE_*` 环境变量覆盖
- **宿主机端口**：写死在 `InfraConfig` 和 `ServiceSpec.ports` 两处（改变端口需要同时改两处）
- **路径**：所有生成状态统一放在 `<repo>/.apps-local/` 下（gitignored，与 cargo target 隔离）

关键设计细节：

```
.apps-local/
├── data/          # L1 各 box 的数据卷 (pg/, redis/, minio/, registry/)
├── boxlite/       # (废弃，实际 L1 SDK home 在 ~/.bl/<hash>/h)
├── boxlite-runner/ # (废弃，实际 runner home 在 ~/.bl/<hash>/r)
├── bin/           # 编译好的 Go 二进制 (boxlite-runner, boxlite-proxy)
└── logs/          # L2 进程日志 + pid 文件
```

**Socket 路径长度处理**：macOS 的 Unix socket 路径限制为 104 字节（`SUN_LEN`）。BoxLite box
的控制 socket 在 `<home>/boxes/<id>/sockets/ready.sock`，如果 home 放在深层 worktree 下会超限。
解决方案：将 socket-bearing home 锚定在机器全局短路径 `~/.bl/<worktree-hash>/` 下。

## 核心设计决策

### 1. `make up` 是自包含的

不需要单独的 `build` / `seed` / `doctor` / `migrate` 命令。`up` 在启动前自动完成：
venv 自举 → 检查 SDK → 安装依赖 → 构建 Go 二进制 → 端口冲突检查 → 拉起 L1 → 启动 L2 → seed 数据

### 2. L1 启动是拓扑排序的

`orchestrator.topo_sort()` 使用 `graphlib.TopologicalSorter`，对 `depends_on` 声明做拓扑分层。
同一层的 box 并行启动，层间串行等待。例如：

```
Layer 0: postgres, redis, minio, registry  (无依赖，并行)
Layer 1: minio-init, dex, jaeger           (依赖 Layer 0 的某些服务)
Layer 2: pgadmin, registry-ui, otel        (依赖 Layer 1)
Layer 3: caddy                              (依赖所有上游)
```

### 3. 幂等 + 自愈

- 已运行的 box 再次 `start()` 时捕获 "already running" 异常，不报错
- 一次性 box（minio-init）每次 `up` 都删除旧 box 重新执行
- L2 进程通过 pidfile 检测存活，端口冲突时自动 kill 旧监听者
- 整个 `up` 可以安全地反复执行

### 4. Box 内部与宿主机的通信

Box 内部解析 `host.boxlite.internal`（gvproxy 提供的 DNS）到达宿主机。例如：
- minio-init 通过 `host.boxlite.internal:29000` 访问 minio API
- caddy 反向代理到 `host.boxlite.internal:<port>` 上的各个服务
- registry-ui 通过 `host.boxlite.internal:25000` 连接 registry

## 命令速查

| 命令 | 作用 |
|---|---|
| `make up` | 一键拉起全部（幂等） |
| `make up COMPONENTS="api runner"` | 只启动指定的 L2 进程 |
| `make status` | 单屏查看 L1 + L2 健康状态 |
| `make down` | 停止 L2（L1 保留） |
| `make down ARGS=--all` | 停止 L2 + 移除 L1 box（数据卷保留） |
| `make restart COMPONENTS="runner dex"` | 重启 L2 进程 / 重建 L1 box |
| `make logs COMPONENT=api` | 查看组件日志（`all` 查看全部） |
| `make reset` | 清除 L2 运行时状态（保留身份 + schema） |
| `make reset ARGS=--hard` | 硬重置：DROP SCHEMA + 重建（身份丢失，需重新登录） |
| `make nuke` | 毁灭一切：L1 box + 数据卷 + 日志全部删除 |

## 文件地图

```
apps/infra-local/
├── Makefile              # 薄壳 → python -m compose <cmd>
├── pyproject.toml        # 包声明 (依赖 boxlite>=0.8)
├── api.env               # API .env 模板 (首次 up 时复制到 apps/api/.env)
├── README.md
└── compose/              # 编排器包
    ├── __main__.py       # CLI 入口 (argparse, 7 个动词)
    ├── config.py         # InfraConfig — 唯一配置真相源 (162 行)
    ├── services.py       # 11 个 ServiceSpec 声明 + SERVICES 注册表 (518 行)
    ├── orchestrator.py   # L1 生命周期: topo_sort, start/stop, healthcheck (401 行)
    ├── native.py         # L2 进程管理 + stack 级命令 (783 行)
    ├── doctor.py         # 启动前检查: SDK 可导入, 运行时可达, 端口未占用 (106 行)
    ├── _sdk.py           # BoxLite SDK 导入兼容层 (29 行)
    └── _local_arm64.py   # Apple Silicon 本地工具链配置
```

### 调用图（`make up` 完整链路）

```
Makefile: up
  └─ python -m compose up [components]
       └─ __main__.py: main()
            ├─ InfraConfig.load()           config.py:114    # 加载配置
            ├─ ensure_home_env()            orchestrator:102 # 设置 BOXLITE_HOME
            └─ native.up(cfg, components)   native.py:505
                 ├─ ensure_tools_on_path()        # 确保 colima/docker 可用
                 ├─ export_dockerhub/ghcr_env()   # 注入 registry 凭据
                 ├─ _ensure_installed()           # 自举 venv + boxlite SDK
                 ├─ ensure_native_lib()           # 构建 boxlite 原生库
                 ├─ _ensure_l1_async()            # L1 编排
                 │    └─ orchestrator.up()        orchestrator:360
                 │         ├─ doctor()            # 预检
                 │         ├─ topo_sort()         # 拓扑排序
                 │         └─ asyncio.gather → start_service() × N
                 │              └─ get_or_create → start → wait_healthy
                 ├─ _go_build("runner")           # 构建 Go 二进制
                 ├─ _go_build("proxy")
                 ├─ _seed_api_env()               # 配置 API .env
                 └─ start_component() × 4         # 启动 L2 (api→runner→proxy→dashboard)
                      ├─ subprocess.Popen(detach) # 后台启动
                      └─ _wait_http / _wait_port  # 等健康
```

### 添加一个新的 L1 服务只需两步

1. 在 `services.py` 中定义一个 `ServiceSpec`（镜像、端口、环境变量、健康检查）
2. 在 `SERVICES` 字典中注册，声明 `depends_on`

不需要改任何其他文件。

## 关键服务间数据流

```
Browser (:3000)
  └─ Dashboard (Vite) ──/api──► API (NestJS :3001)
       │                         │
       │   OIDC 登录重定向       │ 读写
       └──► Dex (:25556)         ▼
                              Postgres (:25432)
                              Redis (:26379)
                              Minio (:29000)

CLI / SDK
  └─ API (:3001) ──创建 Box──► Runner (:3003)
                                  │
                                  └── 拉取镜像 ←── Registry (:25000)

所有服务追踪 ──OTLP──► otel-collector (:24318) ──► Jaeger (:26686)
统一入口      ──────► caddy (:28080) ──反向代理──► 各 UI 服务
```

## 关键约束和已知限制

- **仅支持 Apple Silicon**：L1 镜像和 L2 二进制都是 arm64
- **Box 启动未在此栈上验证**：镜像解析上游正在重写，Dashboard 的镜像选择器已移除
- **首次启动需 5-7 分钟**（拉取 11 个镜像），后续约 30-60 秒
- **宿主机端口固定**，不可通过环境变量覆盖（需同时改 `config.py` 和 `services.py` 两处）
- **Dex 时钟漂移**：Mac 休眠后 dex box 的时钟可能落后，导致 token 签发即过期 → `make restart COMPONENTS=dex`

---

# 实操教程：从零搭建本地开发环境

本教程面向 BoxLite 学习者。我们将从克隆仓库开始，一步一步把完整的本地开发栈跑起来，
并理解每一步背后发生了什么。

> **学习目标**：不仅能跑通 `make up`，更能理解 L1/L2 两层是如何协作的、11 个 microVM
> + 4 个宿主机进程各自扮演什么角色。

---

## 第一步：环境准备

### 硬件与系统要求

| 项目 | 要求 |
|---|---|
| 芯片 | **Apple Silicon** (M1/M2/M3/M4) — infra-local 仅支持 arm64 |
| 内存 | 建议 ≥ 16 GB（11 个 microVM + 4 个原生进程同时运行） |
| 磁盘 | 首次运行需拉取约 5-8 GB 的 OCI 镜像 |
| 系统 | macOS 14+ |

### 软件依赖

在开始之前，确保以下工具已安装：

```bash
# 1. Xcode Command Line Tools（提供 git、cc、make 等）
xcode-select --install

# 2. Homebrew（macOS 包管理器）
# 已有则跳过；没有的话：
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 3. Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# 重启 shell 后确认
rustc --version   # 应 ≥ 1.75

# 4. Go 1.25+
brew install go
go version

# 5. Node.js + Yarn（通过 corepack）
brew install node
corepack enable
node --version    # 应 ≥ 20

# 6. Python 3.10+
python3 --version

# 7. psql（PostgreSQL 客户端，seed 脚本需要）
brew install libpq
# Homebrew 的 libpq 是 keg-only，需要手动加入 PATH
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 8. lsof（macOS 自带，doctor 检查端口占用用）
which lsof

# 9. （可选但建议）GitHub CLI — 用于自动获取 ghcr.io 凭据
brew install gh
gh auth login
```

> **为什么需要 `psql`？** `native.py` 的 `seed()` 函数通过 `psql` 命令行直接查询
> PostgreSQL 来验证 API 是否完成了数据自举（admin 用户、默认 org、region）。这个验证
> 跑在宿主机上，通过 L1 postgres box 映射的 `25432` 端口连接。

> **为什么需要 `lsof`？** `doctor.py` 的 `check_ports_free()` 用 `lsof` 检查每个 L1
> 端口是否被非 BoxLite 进程占用，防止端口冲突导致 box 无法绑定。

---

## 第二步：克隆并初始化仓库

```bash
# 克隆主仓库
git clone https://github.com/boxlite-ai/boxlite.git
cd boxlite

# 初始化子模块（libkrun、e2fsprogs、bubblewrap 的 vendor 源码）
git submodule update --init --recursive
```

子模块包含了 BoxLite 底层虚拟化依赖的 C/Rust 库源码。`infra-local` 的 `_local_arm64.py`
在首次 `make up` 时如果发现子模块未初始化，会自动执行这条命令。

---

## 第三步：首次 `make up` — 从零到全栈运行

```bash
cd apps/infra-local
make up
```

这是**唯一需要的命令**。以下是它自动完成的完整过程（阅读这个过程是理解架构的最佳方式）：

### 阶段 0：Apple Silicon 自举（`_local_arm64.py`，每次 `up` 都执行，幂等）

```
make up
 │
 ├─[0.1] ensure_tools_on_path()
 │       将 /opt/homebrew/opt/libpq/bin 加入 PATH（psql 可用）
 │
 ├─[0.2] export_dockerhub_env() / export_ghcr_env()
 │       从环境变量 → gh auth token → Docker Desktop credStore
 │       逐级尝试获取 Docker Hub / ghcr.io 凭据
 │       注入到 os.environ，供 L1 SDK 和 Go runner 使用
 │       （无凭据也能跑，但可能触发 Docker Hub 匿名限速）
 │
 ├─[0.3] _ensure_installed()                     # native.py:444
 │       ├─ ensure_local_boxlite()                # 构建 boxlite Python SDK（maturin develop）
 │       │   ├─ 创建共享 cargo target 符号链接    # ~/.cache/boxlite/cargo-target/
 │       │   │   （多 worktree 共享编译产物）
 │       │   ├─ ensure_submodules()               # git submodule update --init
 │       │   └─ maturin develop                   # 编译 Rust → Python wheel → 安装
 │       │
 │       └─ pip install -e .                      # 安装 compose 包本身到 venv
 │
 └─[0.4] ensure_native_lib()                      # 构建 libboxlite.a
        └─ make dev:go                            # 编译 libkrun + e2fsprogs + boxlite
           （首次需 10-30 分钟，后续复用共享缓存）
```

**关键学习点**：

- `_local_arm64.py` 把 `~/.cache/boxlite/cargo-target/` 作为机器全局 cargo 编译缓存，
  然后将 `<repo>/target/` 符号链接过去。这意味着一台机器上多个 worktree 共享编译产物，
  第一个 build 慢，后面的只做增量链接。
- `ensure_local_boxlite()` 用 `maturin develop` 安装 repo 本地的 boxlite SDK，**替换**
  PyPI 上的 wheel。因为本地栈依赖某些 PyPI wheel 中没有的修复（如 macOS OCI 只读目录移除）。

### 阶段 1：拉起 L1（11 个 BoxLite microVM）

```
native.py: asyncio.run(_ensure_l1_async(cfg))
 │
 └─ orchestrator.up(cfg, SERVICES)               # orchestrator.py:360
      │
      ├─ doctor(config, services, strict=True)   # 预检（见阶段 1a）
      │
      ├─ topo_sort(SERVICES)                     # 拓扑排序分层
      │   Layer 0: postgres, redis, minio, registry   （无依赖，4 个并行）
      │   Layer 1: dex, jaeger, minio-init            （depends_on 满足后并行）
      │   Layer 2: pgadmin, registry-ui, otel         （等 Layer 1 完成）
      │   Layer 3: caddy                               （等所有上游）
      │
      └─ 按层执行（层内并行，层间串行）
           for layer in [Layer0, Layer1, Layer2, Layer3]:
             asyncio.gather( start_service(box) for box in layer )
```

#### 阶段 1a：预检（doctor）

```
doctor(config, services)                          # doctor.py:83
 ├─ check_sdk()          # 能否 import boxlite？
 ├─ check_runtime()      # await Boxlite.default().list_info() 能否响应？
 └─ check_ports_free()   # 每个 L1 端口是否空闲？
```

#### 阶段 1b：单个 Box 的启动流程

以 postgres 为例：

```
start_service(runtime, SPEC_PG, config)            # orchestrator.py:169
 │
 ├─ 确保数据卷目录存在
 │   mkdir -p .apps-local/data/pg
 │
 ├─ runtime.get_or_create(opts, name="boxlite-local-postgres")
 │   │                                              # BoxLite SDK 调用
 │   │   opts = BoxOptions(
 │   │     image="postgres:17-alpine",
 │   │     cpus=1, memory_mib=512,
 │   │     ports=[(25432, 5432)],                   # 宿主机:容器内
 │   │     volumes=[(".apps-local/data/pg", "/var/lib/postgresql/data")],
 │   │     env={POSTGRES_USER: boxlite, ...},
 │   │     cmd=["postgres", "-c", "statement_timeout=30000", ...]
 │   │   )
 │   │
 │   └─ BoxLite SDK: 拉取镜像 → 创建 microVM → 配置网络 → 挂载卷 → 启动
 │      （首次拉取 postgres:17-alpine 镜像，约 1-2 分钟）
 │
 ├─ box.start()           # 幂等：已运行则捕获 "already running"
 │
 └─ wait_healthy(box, healthcheck)                 # orchestrator.py:243
    │
    │   healthcheck = HealthCheck(
    │     exec=["pg_isready", "-U", "boxlite", "-d", "boxlite", "-t", "1"],
    │     interval_s=2.0, retries=30
    │   )
    │
    └─ 每 2 秒在 box 内执行 `pg_isready`，最多 30 次
       成功 → "postgres: healthy after 3 attempt(s), 5.2s"
       失败 → TimeoutError
```

**每个 Box 都有健康检查**，类型分为两种：
- **exec 探针**（如 postgres 的 `pg_isready`、redis 的 `redis-cli PING`）— 在 box 内执行命令
- **HTTP 探针**（如 minio 的 `/minio/health/live`、dex 的 `/.well-known/openid-configuration`）— 宿主机 HTTP 请求

#### minio-init：一次性 Bootstrap

`SPEC_MINIO_INIT` 的 `one_shot=True` 意味着它是一个**跑完就销毁**的 box：

```
start_service(runtime, SPEC_MINIO_INIT, config)
 │
 ├─ 删除旧的 minio-init box（如果存在）
 ├─ get_or_create → start（执行 shell 脚本）
 │   脚本内容：
 │     mc alias set boxlite <minio_url> <user> <password>   # 连接 minio
 │     mc mb --ignore-existing boxlite/boxlite                # 创建 bucket
 │
 ├─ _wait_one_shot_exit()   # 轮询等待 init 进程退出（最多 60s）
 └─ runtime.remove(name, force=True)  # 清理 box
```

### 阶段 2：构建 L2 二进制文件

```bash
go build -tags boxlite_dev -o .apps-local/bin/boxlite-runner ./cmd/runner
go build -o .apps-local/bin/boxlite-proxy ./cmd/proxy
```

- `runner` 加 `-tags boxlite_dev` 是因为它链接了 BoxLite 原生库（`libboxlite.a`）
- `proxy` 不依赖原生库，直接构建

### 阶段 3：配置 API 环境

```
_seed_api_env(p, agent_img)                        # native.py:481
 │
 ├─ 如果 apps/api/.env 不存在 → 从 api.env 模板复制
 ├─ 强制覆盖 PORT / APP_URL / OTEL_*（infra 管理的配置）
 ├─ 设置 BOXLITE_SYSTEM_BASE_IMAGE（box 基础镜像）
 └─ 创建 apps/.env → api/.env 符号链接
```

### 阶段 4：启动 L2 进程

按 `api → runner → proxy → dashboard` 的顺序依次启动：

```
start_component(p, comp)                            # native.py:281
 │
 ├─ 检查 pidfile：进程已运行？ → 跳过
 ├─ 检查端口：被非本栈进程占用？ → kill 掉
 │
 ├─ subprocess.Popen(
 │     argv=["corepack", "yarn", "nx", "serve", "api"],
 │     cwd="apps/",
 │     env={...os.environ, ...comp.env},
 │     stdout=logfile,
 │     start_new_session=True   # 脱离当前进程，独立进程组
 │   )
 │
 ├─ 写 pidfile → .apps-local/logs/api.pid
 │
 └─ 等健康信号
     api:       _wait_http("http://localhost:3001/api/health", 180s)
     runner:    _wait_port(3003, 60s)
     proxy:     _wait_port(4000, 30s)
     dashboard: _wait_http("http://localhost:3000", 120s)
```

### 阶段 5：Seed 初始数据

```
seed(cfg, no_bounce=True)                           # native.py:738
 │
 ├─ 等待 API 自举完成（NestJS onApplicationBootstrap）
 │   验证: SELECT count(*) FROM "user" WHERE id = 'boxlite-admin'
 │         SELECT count(*) FROM organization WHERE "createdBy" = 'boxlite-admin'
 │         SELECT count(*) FROM region WHERE id = 'us'
 │   三类数据都存在 → 自举成功
 │
 └─ 等待 runner 注册
    验证: SELECT count(*) FROM runner
```

### 首次启动时间线总结

| 阶段 | 首次耗时 | 后续耗时 | 说明 |
|---|---|---|---|
| 0. Apple Silicon 自举 | 10-30 分钟 | 0-5 秒 | 编译 libkrun/libboxlite |
| 1. 拉起 L1 | 3-5 分钟 | 20-40 秒 | 首次拉取 11 个镜像 |
| 2. 构建 L2 | 30-60 秒 | 0-1 秒 | Go 增量编译很快 |
| 3. 配置 API | <1 秒 | <1 秒 | 写 .env 文件 |
| 4. 启动 L2 | 30-60 秒 | 10-20 秒 | nx serve 启动 + 等健康 |
| 5. Seed 数据 | 10-20 秒 | 2-5 秒 | 等 API 自举 + runner 注册 |
| **总计** | **15-40 分钟** | **30-60 秒** | |

---

## 第四步：验证栈是否正常

### 4.1 快速健康检查

```bash
make status
```

输出示例（健康的栈）：

```
L1 — infra-local boxes
  boxlite-local-postgres      running
  boxlite-local-redis         running
  boxlite-local-minio         running
  boxlite-local-registry      running
  boxlite-local-dex           running
  boxlite-local-jaeger        running
  boxlite-local-pgadmin       running
  boxlite-local-registry-ui   running
  boxlite-local-otel          running
  boxlite-local-caddy         running

L2 — native processes
  COMP       PID      PORT     STATE
  api        12345    3001     up
  runner     12346    3003     up
  proxy      12347    4000     up
  dashboard  12348    3000     up

URLs
  Dashboard:      http://localhost:3000
  API:            http://localhost:3001/api
  Dex (OIDC):     http://localhost:25556/dex
  Caddy (entry):  http://localhost:28080
```

每行都应该是绿色的 `up` / `running`。任何一个红色或黄色都说明有问题。

### 4.2 浏览器验证

1. **打开 Dashboard**：`http://localhost:3000`
2. **通过 Dex 登录**：点击登录，跳转到 Dex → 输入 `admin@boxlite.dev` / `password`
3. **登录成功后应看到**：Dashboard 主页（可能是空的，因为还没有创建 Box）

### 4.3 验证各个基础设施服务

```bash
# PostgreSQL — 直接 psql 连接
psql -h 127.0.0.1 -p 25432 -U boxlite -d boxlite
# 密码: boxlite

# Redis — ping 测试
redis-cli -p 26379 PING
# 应返回: PONG

# MinIO — 浏览器打开控制台
open http://127.0.0.1:29001
# 用户名: minioadmin, 密码: minioadmin

# Registry — 查看 catalog
curl http://127.0.0.1:25000/v2/_catalog

# Jaeger UI
open http://127.0.0.1:26686

# pgAdmin
open http://127.0.0.1:25051
# 邮箱: admin@boxlite.dev, 密码: boxlite

# Registry UI
open http://127.0.0.1:25052

# Caddy 统一入口
open http://127.0.0.1:28080
# 显示路由列表
```

### 4.4 验证 API

```bash
# 健康检查端点
curl http://localhost:3001/api/health

# 获取配置（验证 OIDC 配置正确）
curl http://localhost:3001/api/config | jq .
```

---

## 第五步：理解日志系统

所有 L2 进程的日志都写入 `.apps-local/logs/`：

```bash
# 查看所有日志文件
ls -la ../../.apps-local/logs/

# 实时跟踪 API 日志
make logs COMPONENT=api

# 同时跟踪所有组件日志
make logs COMPONENT=all

# 也可以用原生 tail
tail -f ../../.apps-local/logs/api.log
```

L1 Box 的日志怎么查看？目前需要通过 BoxLite SDK 的 `box.exec()` 在 box 内执行命令来查看。例如查看 postgres box 的日志：

```python
# 可以用 python -c 快速调试
cd apps/infra-local
python3 -c "
import asyncio
from compose._sdk import import_sdk
Boxlite, _ = import_sdk()
async def main():
    box = await Boxlite.default().get('boxlite-local-postgres')
    rc, out, err = await box.exec('tail', ['-50', '/var/lib/postgresql/data/pgdata/log/postgresql.log'])
    print(out)
asyncio.run(main())
"
```

---

## 第六步：开发工作流

### 6.1 典型的"改代码 → 看效果"循环

假设你在修改 API 代码（NestJS）：

```bash
# 1. 修改 apps/api/src/... 中的代码
# 2. 重启 API 进程
make restart COMPONENTS=api
# 3. 浏览器刷新 http://localhost:3000 看效果
```

假设你在修改 Runner 代码（Go）：

```bash
# 1. 修改 apps/runner/... 中的代码
# 2. 重启 Runner（会自动 rebuild Go 二进制）
make restart COMPONENTS=runner
```

### 6.2 只启动部分组件

```bash
# 只需要 API + Dashboard（不需要 runner/proxy）
make up COMPONENTS="api dashboard"

# 需要 runner 但不启动 dashboard
make up COMPONENTS="api runner dashboard"

# 重建某个 L1 box（比如 dex 出问题了）
make restart COMPONENTS=dex
```

### 6.3 重置运行状态

```bash
# 软重置：清除 box/job/volume 等运行时数据，保留用户/org/runner
make reset

# 硬重置：DROP SCHEMA + 重建（身份数据丢失，需重新登录）
make reset ARGS=--hard
```

### 6.4 完全重建

```bash
# 停掉 L2
make down

# 停掉 L2 + 移除 L1 box（数据卷保留）
make down ARGS=--all

# 彻底毁灭，下次 up 是冷启动
make nuke
```

---

## 第七步：深入理解 — 自己动手实验

以下实验帮助你理解 L1/L2 的交互方式：

### 实验 1：观察拓扑排序

```bash
# 只删除 postgres box 的数据，然后重启 — 观察依赖链
make down ARGS=--all
make up
# 观察输出中 box 的启动顺序：postgres 先启动 → pgadmin 等它 healthy → caddy 最后
```

### 实验 2：理解 Box 内部网络

```bash
# 进入 caddy box 内部，验证它能解析 host.boxlite.internal
cd apps/infra-local
python3 -c "
import asyncio
from compose._sdk import import_sdk
from compose.orchestrator import exec_collect
Boxlite, _ = import_sdk()
async def main():
    box = await Boxlite.default().get('boxlite-local-caddy')
    # 在 caddy box 内部看 DNS 解析
    rc, out, err = await exec_collect(box, 'nslookup', ['host.boxlite.internal'])
    print('stdout:', out)
    print('stderr:', err)
asyncio.run(main())
"
```

### 实验 3：走一遍 OIDC 登录流程

1. 打开浏览器 DevTools → Network 标签
2. 访问 `http://localhost:3000`
3. 点击登录 → 观察重定向到 `http://localhost:25556/dex/auth`
4. 输入 `admin@boxlite.dev` / `password`
5. 观察 redirect 回 `http://localhost:3000`，带 code 参数
6. Dashboard 将 code 发给 API，API 用 code 向 Dex 换 token
7. 最终获取 JWT，后续请求带 `Authorization: Bearer <jwt>`

### 实验 4：追踪一条请求的完整路径

```
浏览器 http://localhost:3000
  → Dashboard (Vite dev server, :3000)
    → Vite proxy /api → http://localhost:3001/api
      → NestJS API (:3001)
        → TypeORM → PostgreSQL (:25432, 在 L1 microVM 内)
        → Redis (:26379, 在 L1 microVM 内)
        → MinIO (:29000, 在 L1 microVM 内)

API 创建 Box 时：
  → POST /api/box → API (:3001) → INSERT INTO box... → PostgreSQL
  → Runner (:3003) 定期轮询 API → 发现新 box → BoxLite SDK 创建 microVM
  → 拉取镜像 → Registry (:25000, 在 L1 microVM 内)
```

---

## 常见问题排查

### `make up` 卡在 "building native libboxlite.a" 很久

正常现象。首次编译 libkrun（一个 Linux 内核级的虚拟化库）可能需要 **10-30 分钟**。
后续得益于共享 cargo 缓存，几乎瞬间完成。

### Dashboard 登录后立即 `401 Unauthorized`

Mac 休眠导致 dex microVM 时钟漂移，token 签发时就是过期的。

```bash
make restart COMPONENTS=dex
# 然后清除浏览器 storage（DevTools → Application → Clear site data）
```

### 某个 L1 box 一直 `pulling...` 不动

通常是 registry box 内部的进程挂了（TCP 还监听但已经不响应）。

```bash
make restart COMPONENTS=registry
```

### API 返回 `No available runners`

Runner 没有注册成功。检查：
```bash
make logs COMPONENT=runner
# 看看 runner 日志有没有错误
```

或者 runner 虽然注册了但 API 认为它不可用（M5 上会触发 availabilityScore 阈值检查）。
`native.py` 已经内置了 M5 的阈值放宽（`RUNNER_AVAILABILITY_SCORE_THRESHOLD=5`），
如果仍然出问题，检查 runner 的运行状态。

### 端口被占用

```bash
# 查看谁占用了 3001 端口
lsof -nP -iTCP:3001 -sTCP:LISTEN

# 强制释放
make down
# 或者手动 kill
lsof -ti :3001 -sTCP:LISTEN | xargs kill -9
```

### "Another BoxliteRuntime is already using directory"

一个旧的 runner 进程残留了 `.apps-local/boxlite-runner/.lock` 锁文件。

```bash
# 找到持有锁的进程
lsof ../../.apps-local/boxlite-runner/.lock
# kill 掉那个 PID
kill -9 <PID>
# 或者直接 nuke 重建
make nuke && make up
```

### 一切都不行？Nuke 大法

```bash
make nuke    # 毁灭一切
make up      # 从头开始
```

---

## 脚本之外：在 `infra-local` 目录外使用

`make` 命令需要在 `apps/infra-local/` 目录下运行。所有 `make <verb>` 实际上等价于
`python -m compose <verb>`，所以你也可以：

```bash
# 从仓库根目录
cd apps/infra-local && make status

# 或者直接用 Python（前提是 venv 已就绪）
../../.venv-infra/bin/python -m compose status
```

所有 L2 进程以 `start_new_session=True` 启动，意味着它们脱离终端进程，即使你关闭终端
也继续运行。只有显式执行 `make down` 或 `make nuke` 才会停止。

---

# BoxLite 云端分布式架构概览

> 本节面向想在云端分布式环境下开发的学习者。infra-local 把所有东西塞在一台 Mac 上；
> 真正的生产环境是分布式部署在 AWS 上的——理解这个架构是深入开发的前提。

## 全局拓扑：四个核心服务

```
                        Internet
                           │
                    ┌──────┴──────┐
                    │  CloudFront  │  CDN (静态资源 + 部分 API)
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     ┌──────────┐  ┌────────────┐  ┌──────────┐
     │  API ALB │  │ Proxy  NLB │  │ EC2      │
     │  :3000   │  │ :4000      │  │ Runner   │
     └────┬─────┘  └─────┬──────┘  │ :3003    │
          │              │         └────┬─────┘
          ▼              │              │
    ┌──────────┐        │    BoxLite microVM boxes
    │  API     │        │    (libkrun + KVM 嵌套虚拟化)
    │ NestJS   │        │
    └────┬─────┘        │
         │              │
    ┌────┴────┐         │
    ▼         ▼         │
  RDS     ElastiCache   │
  Postgres  Redis       │
                        │
  S3 (对象存储)  ◄──────┘
```

四个核心服务各司其职：

| 服务 | 语言 | 角色 | 类比 |
|---|---|---|---|
| **API** | NestJS (Node) | 控制平面。管 Box/Runner/Org/User 的 CRUD，调度 Box 到 Runner，驱动 Job 队列 | Kubernetes API Server |
| **Runner** | Go | 计算节点。接收 Job → 调 BoxLite Engine 创建 microVM → 上报状态 | Kubernetes Kubelet |
| **Proxy** | Go | 边缘路由。把 `{port}-{boxId}.domain` 的请求路由到对应 Runner 上的 Box 端口 | Kubernetes Ingress |
| **Dashboard** | React/Vite | 前端 SPA，编译后由 API 静态托管（也走 CloudFront） | Kubernetes Dashboard |

## 一图胜千言：创建 Box 的完整链路

这是理解整个分布式系统最重要的交互。一条 `POST /api/box` 请求从头到尾经历了什么：

```
 1. 用户/SDK ──POST /api/box──► API (NestJS)
                                  │
                                  ├─ BoxService.create()
                                  │   ├─ 校验 region/class/quota
                                  │   ├─ runnerService.getRandomAvailableRunner()
                                  │   │   └─ 查 DB: state=READY, 非 unschedulable, 非 draining,
                                  │   │      availabilityScore ≥ 阈值, 同 region, 匹配 class
                                  │   │      TOPSIS 排序 → top 10 → 随机选一个
                                  │   ├─ INSERT INTO box (pending=true, state=UNKNOWN)
                                  │   ├─ jobService.createJob(CREATE_BOX) → INSERT INTO job
                                  │   └─ redis.lpush("runner:jobs:<runnerId>", jobId)
                                  │
 2. Runner ◄──长轮询 PollJobs────┘
       │    GET /runner/jobs/poll?timeout=30&limit=10
       │    ├─ Redis BRPOP "runner:jobs:<runnerId>" (等 30s)
       │    └─ 超时 → DB 兜底: SELECT * FROM job WHERE runnerId=... AND status=PENDING
       │
       ├─ Executor 执行 CREATE_BOX 任务
       │   └─ blclient.Create()
       │       └─ BoxLite Go SDK → C FFI → Rust 核心
       │           ├─ 拉取 OCI 镜像 (ghcr / Docker Hub)
       │           ├─ 创建 rootfs + 挂载 volumes
       │           ├─ 启动 libkrun microVM (KVM 嵌套虚拟化)
       │           ├─ 注入环境变量 (BOXLITE_BOX_ID, BOXLITE_TRACEPARENT ...)
       │           └─ 配置 gvproxy 网络
       │
       ├─ Executor 上报 job.status=COMPLETED → API
       │
 3. API ◄──Runner 健康上报──┘
       POST /runners/healthcheck (每 30s)
       └─ API 更新 runner.availabilityScore (TOPSIS 重算)
```

### 关键设计：Job 队列（v2 异步模式）

v2 是当前默认的 API → Runner 通信方式。API 不再直接调 Runner 的 HTTP 端点，而是**通过 Postgres + Redis 做异步 Job 队列**：

```
API                              Postgres                    Redis                     Runner
 │                                  │                          │                          │
 ├─ jobService.createJob() ───────►│ INSERT job                │                          │
 ├─ notifyRunner() ───────────────────────────────────────────►│ LPUSH runner:jobs:<id>   │
 │                                  │                          │                          │
 │                                  │                          │       ◄── PollJobs() ────┤
 │                                  │                          │       │    BRPOP + DB     │
 │                                  │                          ├───────┘                  │
 │                                  │                          │                          │
 │                                  │  ◄── updateJobStatus ───┤                          │
 │                                  │      (COMPLETED/FAILED)  │                          │
```

**为什么用 Job 队列而不是直接 HTTP 调用？**

1. **解耦**：API 不需要知道 Runner 的网络地址是否可达。Runner 主动拉取，天然支持 Runner 重启后恢复
2. **幂等**：Job 有状态机（PENDING → IN_PROGRESS → COMPLETED/FAILED），乐观锁防止重复执行
3. **可观测**：每个 Job 携带 W3C TraceContext，跨 API → Runner → Box 形成完整分布式追踪
4. **可靠性**：`handleStaleJobs` cron 每分钟扫一次超时的 IN_PROGRESS job，自动标记 FAILED

### Job 状态机

```
PENDING ──► IN_PROGRESS ──► COMPLETED
                │
                └──────────► FAILED (带 errorMessage)
                             (或被 handleStaleJobs 自动标记)
```

Job 类型：`CREATE_BOX`, `START_BOX`, `STOP_BOX`, `DESTROY_BOX`, `RECOVER_BOX`, `UPDATE_BOX_NETWORK_SETTINGS`

## 数据模型（三个核心实体）

### Box — 微虚拟机实例

```
apps/api/src/box/entities/box.entity.ts (280 行)

核心字段:
  id             自定义 ID (PrimaryColumn)
  organizationId 所属组织
  name           名称 (组织内唯一)
  region         区域
  image          OCI 镜像引用
  runnerId       当前所在 Runner
  prevRunnerId   之前所在 Runner (迁移/恢复用)
  state          UNKNOWN → CREATING → STARTED → STOPPING → STOPPED → DESTROYED → ERROR
  desiredState   期望状态
  pending        state != desiredState 时为 true
  cpu/mem/disk   资源配额
  env            jsonb 环境变量
  volumes        jsonb BoxVolume[]
  authToken      nanoid 内部认证令牌
  networkAllowList  网络白名单

关键约束:
  @Unique(['organizationId','name'])   -- 同组织下名称唯一
  pending = (state != desiredState)    -- 自动派生
```

**Box 状态流转**（正常路径）：

```
CREATING ──► STARTING ──► RUNNING ──► STOPPING ──► STOPPED
                │                        │
                └── ERROR                └── DESTROYED
```

### Runner — 计算节点

```
apps/api/src/box/entities/runner.entity.ts (219 行)

核心字段:
  id               uuid
  name             名称
  region           所属区域
  domain           IP/域名
  apiUrl           Runner 的 HTTP API 地址
  proxyUrl         Runner 的 Proxy 地址（给 Proxy 服务用的）
  apiKey           与 API 通信的密钥
  state            REGISTERING → READY → UNRESPONSIVE → DRAINING
  cpu/memoryGiB/diskGiB  总资源
  currentCpuUsagePercentage / currentAllocatedCpu / ...  实时使用量
  availabilityScore  调度评分 (TOPSIS 算法)
  unschedulable    是否禁止调度
  draining         是否正在排空
  apiVersion       '0' (旧 同步HTTP) 或 '2' (新 异步Job)
  lastChecked      API 最后一次收到健康上报的时间
```

**Runner 调度算法（TOPSIS）**：`runnerService.calculateTOPSISScore()` 综合 CPU/内存/磁盘使用率 + Box 数量，加权计算得分。调度时过滤 `score ≥ threshold` 的 Runner，取 top 10 随机选一个。

**Runner 状态流转**：

```
REGISTERING ──► READY ──► (超60s无心跳) ──► UNRESPONSIVE
                   │
                   └── DRAINING (人工标记) ──► 排空所有 Box
```

### Job — 异步任务

```
apps/api/src/box/entities/job.entity.ts

核心字段:
  id             uuid
  version        @VersionColumn (乐观锁，防重复执行)
  type           CREATE_BOX | START_BOX | STOP_BOX | DESTROY_BOX | RECOVER_BOX | UPDATE_BOX_NETWORK_SETTINGS
  status         PENDING → IN_PROGRESS → COMPLETED / FAILED
  runnerId       目标 Runner
  resourceType   BOX
  resourceId     Box ID
  payload        json 字符串 (CreateBoxDTO / StartBoxPayload ...)
  traceContext   jsonb (W3C 分布式追踪上下文)
  errorMessage   失败原因
```

## Proxy：端口预览的路由机制

Box 内部的服务端口（如 terminal 的 22222、用户的 web server 的 8080）通过 Proxy 暴露给外界：

```
用户浏览器
  │  https://8080-<boxId>.proxy.boxlite.dev
  ▼
Proxy (:4000)
  │
  ├─ parseHost("8080-<boxId>.proxy.boxlite.dev") → port=8080, boxId=<boxId>
  │
  ├─ 查 box 是否为 public？ 否 → 验证 X-BoxLite-Preview-Token
  │
  ├─ getBoxRunnerInfo(boxId)
  │   └─ 调 API: GET /runners/by-box/<boxId> → 拿到 runner.apiUrl + runner.apiKey
  │
  ├─ 普通端口 (非 terminal):
  │   └─ dialRunnerTunnel("CONNECT /v1/boxes/<boxId>/network/tunnel?port=8080")
  │       └─ Runner → BoxLite engine → gvproxy → Box 内部 :8080
  │
  └─ Terminal 端口 (22222):
      └─ HTTP 代理到 runner.apiUrl/boxes/<boxId>/toolbox/proxy/22222
```

**关键点**：Proxy 不直接连接 Box —— 它先问 API "这个 Box 在哪个 Runner 上"，然后通过 Runner 的 tunnel API 连到 Box 内部网络。

## AWS 云端部署 (SST v4 / Pulumi)

```
apps/infra/sst.config.ts (1367 行)

拓扑:
  ┌──────────────────────────────────────────────────────┐
  │  VPC (private subnets, NAT via EC2)                  │
  │                                                      │
  │  ┌─────────────────┐  ┌──────────────────────┐      │
  │  │ ECS Fargate      │  │ EC2 c8i.2xlarge       │      │
  │  │  API (:3000)     │  │  Runner (:3003)       │      │
  │  │  Proxy (:4000)   │  │  嵌套 KVM 支持         │      │
  │  └────────┬────────┘  │  /var/lib/boxlite      │      │
  │           │           └──────────────────────┘      │
  │           ▼                                         │
  │  ┌────────┴────────┐                                │
  │  │ RDS Postgres    │  t4g.micro                     │
  │  │ ElastiCache     │  Redis                         │
  │  │ S3 (VPC Endpoint)│ 对象存储                       │
  │  └─────────────────┘                                │
  └──────────────────────────────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
     CloudFront  API ALB    Proxy NLB
     (CDN)       (:443)     (:443 → :4000)

月度成本: ~$600 (单 Runner 最小配置)
```

Runner 是 EC2 金属实例（c8i.2xlarge），因为 BoxLite 的 microVM 依赖硬件虚拟化（KVM 嵌套虚拟化
需要在 EC2 上开启 `nestedVirtualization`），Fargate/容器环境不支持。

Runner 的 `userData` 脚本在启动时下载并校验 runner 二进制 tarball，安装 systemd 服务。
滚动升级通过 SSM Run Command 执行 `scripts/runner-update-binary.mjs`。

## 各组件关键源码入口

学习时可以从这些文件入手：

### API (NestJS)
| 文件 | 做什么 | 行数 |
|---|---|---|
| `apps/api/src/main.ts` | NestJS 启动 + 中间件 + WebSocket | 120 |
| `apps/api/src/app.module.ts` | 根模块，注册所有 feature module | 230 |
| `apps/api/src/box/services/box.service.ts` | Box CRUD + 调度 + 生命周期 | 1429 |
| `apps/api/src/box/services/runner.service.ts` | Runner 管理 + TOPSIS 调度 | 954 |
| `apps/api/src/box/services/job.service.ts` | Job 队列 + notify + poll | 498 |
| `apps/api/src/box/runner-adapter/runnerAdapter.v2.ts` | v2 异步适配器（创建 Job 而非直接调 HTTP）| ~100 |
| `apps/api/src/boxlite-rest/boxlite-proxy.controller.ts` | exec/files/metrics 代理到 Runner | ~150 |

### Runner (Go)
| 文件 | 做什么 | 行数 |
|---|---|---|
| `apps/runner/cmd/runner/main.go` | Go 启动 + 组件装配 + 优雅关闭 | 257 |
| `apps/runner/pkg/boxlite/client.go` | BoxLite Go SDK 封装 (Create/Start/Stop/...) | 577 |
| `apps/runner/pkg/runner/v2/poller/poller.go` | 长轮询 Job (Redis BRPOP + DB 兜底) | ~80 |
| `apps/runner/pkg/runner/v2/executor/executor.go` | Job 执行分发 | ~100 |
| `apps/runner/pkg/runner/v2/healthcheck/healthcheck.go` | 30s 一次健康上报 | ~100 |
| `apps/runner/pkg/services/box_sync.go` | 10s 一次状态对账 (本地 vs 远端) | ~80 |

### Proxy (Go)
| 文件 | 做什么 | 行数 |
|---|---|---|
| `apps/proxy/cmd/proxy/main.go` | Proxy 启动 | ~80 |
| `apps/proxy/pkg/proxy/proxy.go` | Gin 路由 + host 解析 + 中间件 | 294 |
| `apps/proxy/pkg/proxy/get_box_target.go` | 解析 host → 找 Runner → Tunnel/代理 | 451 |
| `apps/proxy/pkg/proxy/tunnel.go` | HTTP CONNECT 隧道 | ~60 |

### Engine (Rust)
| 目录/文件 | 做什么 |
|---|---|
| `src/boxlite/src/runtime/` | BoxliteRuntime — 进程级单例，管理所有 box |
| `src/boxlite/src/litebox/` | LiteBox — 单个 box 的句柄 |
| `src/boxlite/src/vmm/controller/shim.rs` | ShimController — 每个 box fork 一个 shim 子进程 |
| `src/boxlite/src/portal/` | Portal — 宿主机↔客户机 gRPC 桥 |
| `src/boxlite/src/images/` | 镜像管理 (pull/list/ImageStore) |
| `src/boxlite/src/rootfs/` | Rootfs 构建 (OCI 镜像 → ext4 磁盘) |

## 本地 vs 云端的对应关系

| 概念 | infra-local | 云端 AWS |
|---|---|---|
| L1 基础设施 | 11 个 BoxLite microVM | RDS + ElastiCache + S3 |
| L2 API | macOS 进程 :3001 | ECS Fargate :3000 |
| L2 Runner | macOS 进程 :3003 | EC2 c8i.2xlarge :3003 |
| L2 Proxy | macOS 进程 :4000 | ECS Fargate :4000 |
| L2 Dashboard | Vite dev :3000 | 静态文件，CloudFront CDN |
| 对象存储 | MinIO box | S3 |
| DB | Postgres box | RDS Postgres |
| 缓存 | Redis box | ElastiCache Redis |
| OIDC | Dex box | 外部 OIDC Provider |
| 追踪 | Jaeger + otel-collector box | Jaeger + otel-collector (ECS sidecar) |
| 统一入口 | Caddy box :28080 | CloudFront + ALB + NLB |

infra-local 的核心价值在于：**在本地完整复现了云端的服务拓扑和交互协议**。API 代码不知道
Runner 是本机进程还是远端 EC2 —— 对 API 来说，Runner 就是一个 HTTP endpoint + Job 队列。
你在本地改的 API/Runner/Proxy 代码，部署到 AWS 后行为完全一致。

## 学习路线（课程目录）

每个课程是一个独立文件，保存在 [`tutorial/`](./tutorial/) 目录下。按序号循序渐进：

| 课时 | 文件 | 内容 | 预计时长 |
|---|---|---|---|
| 0 | [`tutorial/00-infra-local-hands-on.md`](./tutorial/00-infra-local-hands-on.md) | infra-local 动手实践 | 40 分钟 |
| 1 | [`tutorial/01-box-entity.md`](./tutorial/01-box-entity.md) | Box 实体 — 状态机与不变式 | 30 分钟 |
| 2 | [`tutorial/02-runner-entity.md`](./tutorial/02-runner-entity.md) | Runner 实体与 TOPSIS 调度 | 30 分钟 |
| 3 | [`tutorial/03-job-entity.md`](./tutorial/03-job-entity.md) | Job 实体与乐观锁 | 25 分钟 |
| 4 | [`tutorial/04-box-service-create.md`](./tutorial/04-box-service-create.md) | BoxService.create() — 创建链路 | 40 分钟 |
| 5 | [`tutorial/05-job-service-queue.md`](./tutorial/05-job-service-queue.md) | Job 队列 — 通知/认领/兜底 | 35 分钟 |
| 6 | [`tutorial/06-runner-bootstrap.md`](./tutorial/06-runner-bootstrap.md) | Runner 启动与组件装配 | 30 分钟 |
| 7 | [`tutorial/07-runner-poller-executor.md`](./tutorial/07-runner-poller-executor.md) | Poller + Executor + 追踪传播 | 35 分钟 |
| 8 | [`tutorial/08-proxy-routing.md`](./tutorial/08-proxy-routing.md) | Proxy 端口路由与缓存体系 | 30 分钟 |
| 9 | [`tutorial/09-aws-deployment.md`](./tutorial/09-aws-deployment.md) | AWS SST 云端部署 | 35 分钟 |
| 10 | [`tutorial/10-boxlite-engine.md`](./tutorial/10-boxlite-engine.md) | BoxLite Engine 内核架构 | 40 分钟 |
| 11 | [`tutorial/11-volume.md`](./tutorial/11-volume.md) | Volume — S3 到 Box 的四层挂载链 | 40 分钟 |

**阅读建议**：每课先读源文件（标注了文件路径和行号），再读讲解。代码和讲解对照学习效果最好。
