# 第 10 课：BoxLite Engine 内核 — 从 Rust 库到硬件 microVM

> **源文件**：`docs/architecture/README.md`、`src/boxlite/src/lib.rs`、`src/boxlite/src/runtime/`
> **学习目标**：理解 BoxLite Engine 的内核架构——Rust 库如何变成硬件隔离的 microVM。

## Engine 是什么？

BoxLite Engine 是一个 **Rust 库**（不是独立进程）。遵循 SQLite 哲学："embed as a library"。
可以被 Go（C FFI）、Python（PyO3）、Node.js（napi-rs）嵌入。

## 分层架构

```
┌──────────────────────────────────────────────┐
│              Host Application                 │
│  ┌────────────────────────────────────────┐  │
│  │          BoxliteRuntime                │  │  Rust struct, 进程级单例
│  │  ┌──────────┐  ┌──────────┐            │  │
│  │  │BoxManager│  │ImageMgr  │  Metrics   │  │
│  │  └──────────┘  └──────────┘            │  │
│  └────────────────────────────────────────┘  │
│                    │                          │
│  ┌────────────────────────────────────────┐  │
│  │            LiteBox                     │  │  每个 Box 一个 handle
│  │  ┌──────────┐  ┌──────────┐            │  │
│  │  │Lifecycle │  │  Exec    │  Metrics   │  │
│  │  └──────────┘  └──────────┘            │  │
│  └────────────────────────────────────────┘  │
│                    │                          │
│  ┌────────────────────────────────────────┐  │
│  │        ShimController                  │  │  每个 Box fork 一个 shim 子进程
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
                     │  fork + exec
                     ▼
┌──────────────────────────────────────────────┐
│          JAILER BOUNDARY (OS Sandbox)        │
│  ┌────────────────────────────────────────┐  │
│  │      Shim Process (boxlite-shim)       │  │
│  │  - Seccomp (Linux)                     │  │
│  │  - Namespace isolation                 │  │
│  │  - sandbox-exec (macOS)                │  │
│  │  - cgroups / rlimits                   │  │
│  └────────────────────────────────────────┘  │
│                    │                          │
│              Unix Socket / Vsock              │
│                    │                          │
│  ┌────────────────────────────────────────┐  │
│  │          Box (Guest VM)                │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │        Guest Agent               │  │  │
│  │  │  Guest | Container | Execution   │  │  │
│  │  └──────────────────────────────────┘  │  │
│  │              │                          │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │    OCI Container Runtime         │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

## 核心组件逐一解读

### BoxliteRuntime（`src/boxlite/src/runtime/`）

进程级单例。持有所有 Box 的状态：

```
RuntimeInnerImpl
├── sync_state (RwLock)
│   ├── BoxManager       # 所有 Box 的生命周期追踪
│   └── ImageManager     # OCI 镜像缓存和管理
└── non_sync_state (immutable)
    └── FilesystemLayout  # ~/.boxlite 目录结构
```

**关键 API**：
- `create(opts) → LiteBox` — 创建 Box
- `get(name) → LiteBox` — 按名称获取
- `get_or_create(opts, name) → LiteBox` — 幂等创建
- `list_info() → Vec<BoxInfo>` — 列出所有 Box 状态
- `remove(name)` — 删除 Box

### LiteBox（`src/boxlite/src/litebox/`）

单个 Box 的句柄。暴露给 SDK 用户：

```rust
impl LiteBox {
    async fn start(&self) -> Result<()>
    async fn stop(&self) -> Result<()>
    async fn exec(&self, cmd: &str, args: &[&str]) -> Execution
    async fn pull_image(&self, image: &str) -> Result<()>
}
```

### ShimController（`src/boxlite/src/vmm/controller/shim.rs`）

每个 Box 启动时，ShimController fork 一个 `boxlite-shim` 子进程。
Shim 进程在 Jailer 的 sandbox 中运行，通过 Unix socket 或 Vsock 与宿主机通信。

**为什么 fork 子进程？**
- 隔离：shim 崩溃不会导致宿主进程崩溃
- 安全：shim 在 sandbox（seccomp + namespace）中运行，限制了攻击面
- 生命周期：shim 随 Box 消亡而退出，资源自动释放

### Portal（`src/boxlite/src/portal/`）

宿主机↔客户机的 gRPC 桥。gRPC 服务定义：
- `Guest.Init` — 初始化客户机
- `Container.Init` — 启动 OCI 容器
- `Execution.Exec` — 执行命令
- `Execution.Attach` — 附着到运行中的执行（终端交互）
- `Execution.Wait` — 等待执行结束
- `Execution.Kill` — 发送信号
- `Execution.ResizeTty` — 调整终端大小

### Guest Agent（`shim/src/main.rs` 内部）

运行在客户机 VM 内的守护进程。接收 Portal 的 gRPC 请求，转换为客户机内部的操作：
- 启动 OCI 容器运行时
- 执行命令、管理 stdin/stdout/stderr 流
- 管理容器生命周期

### ImageManager（`src/boxlite/src/images/`）

OCI 镜像管理。支持：
- 从 registry 拉取镜像（Docker Hub, ghcr.io, 私有 registry）
- 镜像缓存和去重
- 多架构选择（linux/arm64, linux/amd64）

### 网络（`src/boxlite/src/net/`）

默认使用 **gvproxy**（Go 写的轻量级用户态网络栈）：
- 提供 DHCP、DNS（`host.boxlite.internal`）
- 端口映射（宿主机:客户机）
- 支持 `allow_net` / `block_net` 出站控制

备选方案：libslirp（类似于 QEMU 的 user-mode 网络）。

### VMM 层（`src/boxlite/src/vmm/`）

生产环境使用 **libkrun**（基于 Linux KVM 的轻量级 VMM）。备选：macOS Hypervisor.framework。

libkrun 的特点：
- 极快启动（< 100ms 冷启动）
- 基于 KVM，硬件级隔离
- 支持 virtio-fs（高效文件共享）、virtio-gpu

## 从 API 到硬件：一次 Box 创建的完整引擎路径

```
Runner: boxliteClient.Create(dto)
  │
  ├─[Go SDK] sdks/go/boxlite.go
  │   CGO → Rust FFI → BoxliteRuntime.create(opts)
  │
  ├─[ImageManager] 拉取 OCI 镜像
  │   ├─ 检查缓存（已有 → 跳过）
  │   └─ HTTP 从 registry 拉取 layers → 解压到缓存
  │
  ├─[Rootfs] 从 OCI 镜像构建 ext4 磁盘
  │   ├─ 创建空白 ext4 镜像文件
  │   ├─ 将 OCI layers 叠加写入
  │   └─ 注入环境变量文件 (BOXLITE_BOX_ID, ...)
  │
  ├─[Volumes] 挂载外部卷
  │   └─ virtio-fs 或 9p 挂载
  │
  ├─[ShimController] fork shim 子进程
  │   ├─ Jailer: seccomp + namespace + cgroups
  │   └─ 启动 boxlite-shim 二进制
  │
  ├─[VMM] 启动 libkrun microVM
  │   ├─ KVM_CREATE_VM → KVM_CREATE_VCPU
  │   ├─ 附加 rootfs ext4 磁盘
  │   ├─ 配置 virtio 设备（net, fs, console）
  │   └─ 启动 Linux 内核
  │
  ├─[Guest Agent] 在 VM 内启动
  │   ├─ 初始化 gRPC 服务
  │   └─ 上报 Guest.Init 就绪
  │
  ├─[Container] 启动 OCI 容器
  │   ├─ Portal.Container.Init
  │   └─ runc/crun 启动容器
  │
  └─ Box 就绪 → 返回 StartBoxResponse{DaemonVersion}
```

## 关键设计哲学

1. **Library, not Daemon**：没有后台服务。`BoxliteRuntime` 就是一个 Rust struct。
   宿主进程创建它 → 使用它 → 销毁它。简单、可控、无单点故障。

2. **Shim 子进程模型**：每个 Box 一个 shim，fork 时继承状态，之后完全隔离。
   类比 Docker 的 `containerd-shim`，但更轻量。

3. **gRPC 作为内部协议**：Portal（宿主机）↔ Guest Agent（VM 内）通过 gRPC 通信。
   虽然有性能开销，但强类型 + 流式传输 + 双向通信适合 VM 间通信。

4. **OCI 原生**：不重新发明镜像格式。任何 Docker 镜像都可以直接运行。
   `ImageManager` 直接与 OCI Distribution API 对话（不依赖 Docker daemon）。

5. **平台抽象**：Linux KVM 和 macOS Hypervisor.framework 共享同一套上层 API。
   infra-local 在 macOS 上跑微 VM，AWS Runner 在 Linux 上跑 —— 对上层透明。

---

**上一课**：[第 9 课：AWS 云端部署](./09-aws-deployment.md)
**课程目录**：[第 0 课：infra-local 动手实践](./00-infra-local-hands-on.md)
