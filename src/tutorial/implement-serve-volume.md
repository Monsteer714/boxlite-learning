# 亲手实现 `boxlite serve` named-volume 创建与挂载

> 本教程面向**从没写过 Rust** 的学习者。目标是让你在干净的代码库上,照着下面的
> 步骤**亲手敲一遍**,理解这个 issue 涉及的流程与架构。
>
> - 干净起点:分支 `main-local`(本教程所在分支),特性代码已全部移除。
> - 参考实现:分支 `feat/serve-volume`(你卡住时可以去看,但先自己敲)。
> - 配套文档:`src/implement/development-workflow.md`(研发流程)、
>   `src/implement/serve-volume-pull-request.md`(PR 描述)、
>   `src/tutorial/volume-mount-call-stack.md`(调用栈总览)。
>
> 建议顺序:先读本教程 **一、二、三** 建立整体概念,再跟着 **四** 一步一步敲,
> 每敲完一个文件就编译一次。全程只用 `make` 命令,不要直接敲 `cargo`。

---

## 一、这个 issue 到底做了什么

一句话:**让 `boxlite serve` 的 `/v1/volumes` 从"每个操作都报错"变成"真正能用"**。

`boxlite serve` 是一个本地 REST 服务器。改动前后对比:

| 能力 | 之前 | 之后 |
|---|---|---|
| `POST /v1/volumes` 创建卷 | 返回 `400 UnsupportedError` | 在磁盘上建一个目录,返回 `volume_id` |
| `GET /v1/volumes` 列卷 | 报错 | 枚举 `{home}/volumes/` 下的目录 |
| `DELETE /v1/volumes/{id}` 删卷 | 报错 | 删目录 |
| `POST /v1/boxes` 挂载卷 | 无此字段 | 新增 `volumes:[{volume_id, guest_path}]` |

核心设计:**一个 named volume = 磁盘上一个目录 `{home}/volumes/{id}`**。不需要数据库表,
`list` 就是读目录,`get` 就是检查目录在不在,`remove` 就是删目录。这和 box 状态持久化的
思路一致——用文件系统当索引。

**安全边界**:REST 客户端永远只发 `volume_id`;服务器通过 volume backend 自己解析出
物理路径。所以客户端永远无法让服务器挂载一个任意的宿主目录。

---

## 二、整体架构与调用栈

先建立地图。两条"入站"路径在 `BoxOptions.volumes` 之后**汇合成同一条下游**:

```text
┌─ 入站路径 A:CLI ─────────────────────────────────────────────┐
│  boxlite create -v /data  (匿名卷)                            │
│    └─ VolumeFlags::apply_to    cli.rs:880                     │
│         ├─ create_dir_all({home}/volumes/anonymous/{ulid})    │  ← 先建目录
│         └─ opts.volumes.push(VolumeSpec)   cli.rs:915         │  ← 再入队
└──────────────────────────────┬────────────────────────────────┘
                               │
┌─ 入站路径 B:REST serve ──────▼────────────────────────────────┐
│  POST /v1/boxes {"volumes":[...]}                             │
│    └─ create_box              handlers/boxes.rs:16            │
│         ├─ resolve_volume_mounts   serve/mod.rs:736           │  ← ★ 本次新增
│         │    └─ runtime.volumes() → VolumeHandle.get(id)      │
│         │         └─ NamedVolumeStore::get    store.rs        │  ← ★ 本次新增
│         └─ build_box_options    serve/mod.rs:759              │  ← volumes 装进 BoxOptions
└──────────────────────────────┬────────────────────────────────┘
                               ▼
                     BoxOptions { volumes: Vec<VolumeSpec> }
                               │
┌─ 下游(两者共享,本次不动)─────▼────────────────────────────────┐
│  runtime.create(options)                                      │
│    └─ vmm_spawn.rs:155  resolve_user_volumes(&options.volumes)│
│         └─ classify_volume_share → ResolvedVolume             │
│              └─ ContainerVolumeManager::add_volume            │
│                   ├─ guest.add_fs_share(tag, dir)   ← virtio-fs│
│                   └─ container_mounts.push(...)     ← 容器挂载 │
│                        → InstanceSpec → gRPC → guest mount    │
└───────────────────────────────────────────────────────────────┘
```

关键认知:

1. **`BoxOptions.volumes` 是唯一接力棒**。CLI 和 serve 各自负责把"用户的卷描述"
   翻译成 `VolumeSpec { host_path, guest_path, read_only }`,塞进 `BoxOptions.volumes`,
   剩下的全走同一条下游。
2. **本次新增的两块**就是入站路径 B 里的 `★` 标记:一个磁盘 store(`NamedVolumeStore`)
   和一条解析函数(`resolve_volume_mounts`)。
3. **类型层级**(Rust 里"接口 + 多实现"的体现):
   `VolumeBackend`(trait/接口)→ `LocalRuntime` 和 `RestRuntime` 各自实现它 →
   serve 只持有 `Arc<dyn VolumeBackend>`(trait 对象),运行时才知道具体是谁。

---

## 三、Rust 概念补课(本 issue 会遇到的)

下面每个概念都标了"在本 issue 里出现的位置",看不懂时回来对照。

### 1. module 与 `use`
Rust 文件即模块。`src/boxlite/src/volumes/store.rs` 就是模块 `store`,它在
`volumes/mod.rs` 里被 `mod store;` 声明。`pub use` 把内部类型对外公开。
- 本次位置:`volumes/mod.rs` 把 `NamedVolumeStore` 和 `VolumeInfo` 从 `store` 模块 re-export 出去。

### 2. struct(结构体)+ derive
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeInfo {
    pub id: String,
    pub host_path: PathBuf,
    pub created_at: DateTime<Utc>,
    pub size_bytes: Option<u64>,
}
```
- `#[derive(...)]` 是宏,自动实现 `Debug`(打印)、`Clone`(拷贝)、`Serialize`/`Deserialize`(JSON 序列化,来自 `serde`)。
- `pub` 字段表示对外可读。`Option<u64>` 表示"可能有值,也可能没有"。
- 本次位置:`store.rs` 的 `VolumeInfo` 和 `NamedVolumeStore`。

### 3. trait + impl(接口与实现)
```rust
pub trait VolumeBackend {              // 定义"接口"
    async fn create_volume(&self) -> BoxliteResult<VolumeInfo>;
    ...
}

impl VolumeBackend for LocalRuntime {  // 某个具体类型实现这个接口
    async fn create_volume(&self) -> ... { ... }
}
```
- 一个类型可以实现多个 trait。`LocalRuntime` 同时实现了 `RuntimeBackend` 和 `VolumeBackend`。
- 本次位置:`rt_impl.rs` 底部 `impl super::volumes::VolumeBackend for LocalRuntime`。

### 4. trait 对象 `Arc<dyn Trait>`
```rust
pub struct VolumeHandle {
    backend: Arc<dyn VolumeBackend>,   // "指向某个实现了该接口的对象的共享指针"
}
```
- `Arc<T>` = 多线程共享所有权的智能指针(引用计数)。
- `dyn VolumeBackend` = 具体类型未知的 trait 对象,调用时动态分发。
- 这样 serve 层只需面向接口编程,不用知道到底是 `LocalRuntime` 还是 `RestRuntime`。
- 本次位置:`volumes.rs` 的 `VolumeHandle`;`core.rs` 的 `volume_backend: Option<Arc<dyn VolumeBackend>>`。

### 5. async / await + async_trait
```rust
#[async_trait::async_trait]
impl VolumeBackend for LocalRuntime {
    async fn create_volume(&self) -> ... { ... }
}
```
- `async fn` 是异步函数,返回一个 future;`await` 是等它完成。
- `#[async_trait]` 是宏,让"接口方法也可以是异步的"(Rust 原生不支持 async trait 方法,用宏包装)。
- 本次位置:`VolumeBackend` 定义和 `LocalRuntime` 实现都带 `#[async_trait::async_trait]`。

### 6. `Result` 与 `?` 操作符
```rust
pub fn create(&self) -> BoxliteResult<VolumeInfo> {   // BoxliteResult<T> = Result<T, BoxliteError>
    let dir = self.volumes_dir.join(&id);
    fs::create_dir_all(&dir).map_err(|e| BoxliteError::Storage(format!("...")))?;
    Ok(VolumeInfo { ... })
}
```
- `Result<T, E>` 有两个变体:`Ok(T)` 成功、`Err(E)` 失败。
- `?` 是"失败就提前返回"的语法糖:若表达式是 `Err` 就直接 `return Err(..)`。
- `.map_err(|e| ...)` 把底层错误 `e` 转换成业务错误 `BoxliteError`(自定义错误类型)。
- 本次位置:`store.rs` 的每个方法都是 `BoxliteResult<T>`,错误类型是 `BoxliteError::Storage/NotFound/InvalidArgument`。

### 7. 迭代器与 `collect`
```rust
for entry in entries.flatten() { ... }
let ids: Vec<String> = infos.into_iter().map(|v| v.id).collect();
```
- `flatten()` 跳过 `Result::Err`;`.map().collect()` 是"转换 + 收集成 Vec"。
- 本次位置:`store.rs::list`、测试里收集 id。

### 8. `#[cfg(test)]` 单元测试
```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn create_then_get_roundtrips() { ... }
}
```
- `#[cfg(test)]` 表示这段代码只在测试构建时编译。
- `#[test]` 标记测试函数;`tempfile::tempdir()` 建临时目录(测试完自动删除)。
- 本次位置:`store.rs` 底部 6 个测试。

### 9. serde 反序列化与 `deny_unknown_fields`
```rust
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CreateVolumeMount {
    pub volume_id: String,
    pub guest_path: String,
    #[serde(default)]
    pub read_only: bool,
}
```
- `Deserialize` 从 JSON 生成结构体;`#[serde(default)]` 表示缺省时用默认值。
- `deny_unknown_fields` = "JSON 里出现结构体没有的字段就报错"。这是本 issue 的**安全关键**:
  客户端想在请求里偷偷塞 `host_path` 会直接 400。
- 本次位置:`serve/types.rs` 的 `CreateVolumeMount` 和 `CreateBoxRequest`。

### 10. `BoxliteError` 与 HTTP 状态码的映射
```rust
let err = store.get("does-not-exist").unwrap_err();
assert!(matches!(err, BoxliteError::NotFound(_)));
```
- `BoxliteError::NotFound` 通过 `err.http()` 映射成 HTTP 404;`InvalidArgument` → 400。
- serve 层用 `error_from_boxlite(&e)` 统一把业务错误转成 HTTP 响应,不用在 handler 里逐类判断。
- 本次位置:`store.rs::get` 返回 `NotFound`;`serve/mod.rs::resolve_volume_mounts` 的 `guest_path` 校验返回 `InvalidArgument`。

---

## 四、分步实现(照着敲)

**编译/验证指令**(每步之后都跑):
```bash
make cli                          # 编译
make fmt:rust                     # 格式化(提交前必须)
make fmt:check:rust               # 检查格式
make test:unit:rust FILTER=volumes::store   # 只跑 store 单测
```

### Step 1 — `src/boxlite/src/volumes/store.rs`(核心,从头写)

这是整个 issue 的心脏:一个"一个卷一个目录"的本地 store。

先看现状(`store.rs` 现在是空壳,只有 `VolumeInfo` 没有 `host_path`,注释写着
"backend not yet implemented")。把它**整文件替换**为:

```rust
//! Named-volume storage: metadata type + local filesystem store.
//!
//! Volumes are addressed by a server-assigned id (like boxes). Each named
//! volume is a directory `{home}/volumes/{id}` created on demand; the payload
//! lives directly in that directory and is what a box mounts at a guest path.
//!
//! The `anonymous/` subdirectory under `{home}/volumes/` is the CLI's anonymous
//! volume host (`-v /data`), managed by `VolumeFlags::apply_to`, not by this
//! store — `list` skips it.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use boxlite_shared::errors::{BoxliteError, BoxliteResult};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Directory name used by the CLI for anonymous volumes inside the volumes root.
const ANONYMOUS_VOLUMES_DIR: &str = "anonymous";

/// Public metadata about a volume.
///
/// Mirrors the shape of [`crate::runtime::types::ImageInfo`]: a storage-agnostic
/// view suitable for CLI/table rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeInfo {
    /// Server-assigned volume id — the addressing key for get/remove.
    pub id: String,

    /// Host directory backing this volume (`{home}/volumes/{id}`). Boxes mount
    /// this path; the REST surface exposes it so clients can resolve a volume
    /// id to a mount source without a second lookup.
    pub host_path: PathBuf,

    /// When the volume was created.
    pub created_at: DateTime<Utc>,

    /// Size of the payload in bytes, if it could be computed.
    pub size_bytes: Option<u64>,
}

/// Local filesystem store for named volumes.
///
/// One directory per volume under `{home}/volumes/`, so the layout needs no
/// database table: `list` reads the directory, `get` checks for one entry,
/// `remove` deletes it. Mirrors how box state persists on disk without an
/// extra index.
#[derive(Debug, Clone)]
pub struct NamedVolumeStore {
    volumes_dir: PathBuf,
}

impl NamedVolumeStore {
    /// Create a store rooted at `{home_dir}/volumes`.
    pub fn new(home_dir: &Path) -> Self {
        Self {
            volumes_dir: home_dir.join("volumes"),
        }
    }

    /// Create a new volume and return its metadata (including the assigned id).
    pub fn create(&self) -> BoxliteResult<VolumeInfo> {
        let id = crate::runtime::id::BoxIDMint::mint().to_string();
        let dir = self.volumes_dir.join(&id);
        fs::create_dir_all(&dir).map_err(|e| {
            BoxliteError::Storage(format!(
                "failed to create volume directory {}: {}",
                dir.display(),
                e
            ))
        })?;
        Ok(VolumeInfo {
            id,
            host_path: dir,
            created_at: Utc::now(),
            size_bytes: None,
        })
    }

    /// List all named volumes.
    pub fn list(&self) -> BoxliteResult<Vec<VolumeInfo>> {
        let entries = match fs::read_dir(&self.volumes_dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => {
                return Err(BoxliteError::Storage(format!(
                    "failed to read volumes directory {}: {}",
                    self.volumes_dir.display(),
                    e
                )));
            }
        };

        let mut infos = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            // The CLI's anonymous volumes live under `volumes/anonymous/`; they
            // are not server-assigned named volumes and are not listed here.
            if name == ANONYMOUS_VOLUMES_DIR {
                continue;
            }
            infos.push(self.volume_info(name, &path));
        }
        Ok(infos)
    }

    /// Get metadata for a single volume by id.
    ///
    /// Returns `BoxliteError::NotFound` when no such volume exists.
    pub fn get(&self, id: &str) -> BoxliteResult<VolumeInfo> {
        let dir = self.volume_dir(id)?;
        if !dir.is_dir() {
            return Err(BoxliteError::NotFound(format!("volume not found: {id}")));
        }
        Ok(self.volume_info(id.to_string(), &dir))
    }

    /// Remove a volume by id. With `force`, a missing volume is a no-op.
    pub fn remove(&self, id: &str, force: bool) -> BoxliteResult<()> {
        let dir = self.volume_dir(id)?;
        if !dir.exists() {
            if force {
                return Ok(());
            }
            return Err(BoxliteError::NotFound(format!("volume not found: {id}")));
        }
        if !dir.is_dir() {
            return Err(BoxliteError::InvalidArgument(format!(
                "volume path is not a directory: {}",
                dir.display()
            )));
        }
        fs::remove_dir_all(&dir).map_err(|e| {
            BoxliteError::Storage(format!(
                "failed to remove volume directory {}: {}",
                dir.display(),
                e
            ))
        })
    }

    /// Resolve `{volumes_dir}/{id}` with a path-traversal guard: the id must be
    /// a single directory name, never a path. The reserved `anonymous/` subtree
    /// (the CLI's anonymous volumes) is also rejected — this store must never
    /// touch it, neither to list nor to delete.
    fn volume_dir(&self, id: &str) -> BoxliteResult<PathBuf> {
        if id.is_empty()
            || id == "."
            || id == ".."
            || id.contains('/')
            || id.contains('\\')
            || id == ANONYMOUS_VOLUMES_DIR
        {
            return Err(BoxliteError::InvalidArgument(format!(
                "invalid volume id: {id:?}"
            )));
        }
        Ok(self.volumes_dir.join(id))
    }

    fn volume_info(&self, id: String, dir: &Path) -> VolumeInfo {
        // Derive creation time from the directory's mtime so `list`/`get`
        // agree with what `create` reported.
        let created_at = fs::metadata(dir)
            .and_then(|m| m.modified())
            .ok()
            .map(DateTime::<Utc>::from)
            .unwrap_or_else(Utc::now);
        VolumeInfo {
            id,
            host_path: dir.to_path_buf(),
            created_at,
            size_bytes: None,
        }
    }
}
```

**逐段讲解**(敲的时候对着看):

- `pub struct NamedVolumeStore { volumes_dir: PathBuf }` — 门面结构体,只存一个根目录。
  "门面(facade)"意思是:对外只暴露 `new/create/list/get/remove` 几个入口,内部实现细节
  (`volume_dir`、`volume_info`、`ANONYMOUS_VOLUMES_DIR`)全私有。这是本仓库的设计风格
  (CLAUDE.md: *high cohesion, low coupling via struct facade*)。
- `new(home_dir)` — `home_dir.join("volumes")` 拼出根目录。**不要**在这里硬编码绝对路径。
- `create()` — `BoxIDMint::mint()` 生成一个唯一 id(和 box 共用的 id 生成器),`create_dir_all`
  建目录。`?` 表示失败就返回 `BoxliteError::Storage`。
- `list()` — `read_dir` 枚举根目录;目录不在了返回空列表(`io::ErrorKind::NotFound`)。
  **跳过 `anonymous/`**:那是 CLI 匿名卷的地盘,不属于本 store 管。
- `get()` — 先过 `volume_dir` 守卫,再查目录在不在,不在返回 `NotFound`。
- `remove()` — `force=true` 时卷不存在也不报错(幂等,方便删除接口);存在则 `remove_dir_all`。
- `volume_dir()` — **安全关键**。拒绝空串、`.`、`..`、含 `/` 或 `\` 的 id(防路径穿越),
  还拒绝保留名 `anonymous`。这个 `anonymous` 拦截是代码评审时补的:否则
  `DELETE /v1/volumes/anonymous` 会把 CLI 匿名卷全删了。
- `volume_info()` — 用目录 mtime 当 `created_at`(比 `create` 时记 `Utc::now()` 更一致),
  `size_bytes` 暂不统计,给 `None`。

**注意**:store 需要 `chrono`、`serde`、`tempfile`(测试用)这些依赖。检查
`src/boxlite/Cargo.toml`——它们应该已经在依赖里了(本仓库 `tempfile` 是既有 dev-dependency)。
如果 `make cli` 报找不到 crate,再去加。

现在给 store 补单元测试(`#[cfg(test)] mod tests` 追加到文件末尾):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_then_get_roundtrips() {
        let tmp = tempfile::tempdir().unwrap();
        let store = NamedVolumeStore::new(tmp.path());
        let created = store.create().unwrap();

        assert!(created.host_path.is_dir());
        assert_eq!(
            created.host_path,
            tmp.path().join("volumes").join(&created.id)
        );

        let got = store.get(&created.id).unwrap();
        assert_eq!(got.id, created.id);
        assert_eq!(got.host_path, created.host_path);
    }

    #[test]
    fn list_lists_only_named_volumes() {
        let tmp = tempfile::tempdir().unwrap();
        let store = NamedVolumeStore::new(tmp.path());
        let v1 = store.create().unwrap();
        let v2 = store.create().unwrap();

        // An anonymous CLI volume under volumes/anonymous/ must not be listed.
        let anon = tmp.path().join("volumes").join("anonymous").join("ulid-x");
        fs::create_dir_all(&anon).unwrap();

        let ids: Vec<String> = store.list().unwrap().into_iter().map(|v| v.id).collect();
        assert!(ids.contains(&v1.id));
        assert!(ids.contains(&v2.id));
        assert_eq!(ids.len(), 2, "anonymous volume must be excluded: {ids:?}");
    }

    #[test]
    fn remove_deletes_and_force_tolerates_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let store = NamedVolumeStore::new(tmp.path());
        let created = store.create().unwrap();

        store.remove(&created.id, false).unwrap();
        assert!(!created.host_path.exists());

        // Non-force on a missing volume errors.
        let err = store.remove(&created.id, false).unwrap_err();
        assert!(matches!(err, BoxliteError::NotFound(_)));

        // Force is a no-op on a missing volume.
        store.remove(&created.id, true).unwrap();
    }

    #[test]
    fn get_missing_volume_is_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let store = NamedVolumeStore::new(tmp.path());
        let err = store.get("does-not-exist").unwrap_err();
        assert!(matches!(err, BoxliteError::NotFound(_)));
    }

    #[test]
    fn traversal_ids_are_rejected() {
        let tmp = tempfile::tempdir().unwrap();
        let store = NamedVolumeStore::new(tmp.path());
        for bad in ["..", ".", "a/b", "../escape", "a\\b"] {
            assert!(
                store.get(bad).is_err(),
                "id {bad:?} must be rejected by get"
            );
            assert!(
                store.remove(bad, true).is_err(),
                "id {bad:?} must be rejected by remove"
            );
        }
    }

    #[test]
    fn reserved_anonymous_id_is_protected() {
        let tmp = tempfile::tempdir().unwrap();
        let store = NamedVolumeStore::new(tmp.path());
        // A real CLI anonymous volume living under volumes/anonymous/.
        let anon = tmp.path().join("volumes").join("anonymous").join("ulid-x");
        fs::create_dir_all(&anon).unwrap();

        assert!(
            store.get("anonymous").is_err(),
            "get must reject the reserved anonymous id"
        );
        assert!(
            store.remove("anonymous", true).is_err(),
            "remove must reject the reserved anonymous id"
        );
        assert!(
            anon.is_dir(),
            "anonymous volumes must survive a remove attempt"
        );
    }
}
```

**测试要点**:
- `tempfile::tempdir()` 建临时目录,测试结束自动清理,不污染真实数据。
- 第 2 个测试故意造一个 `anonymous/ulid-x` 目录,断言 `list` 不返回它。
- 第 6 个测试(评审后补的)造一个真实匿名卷,断言 `get`/`remove` 拒绝 `anonymous` 且目录幸存。

编译 + 测试:
```bash
make test:unit:rust FILTER=volumes::store   # 应看到 6 passed
```

### Step 2 — `src/boxlite/src/volumes/mod.rs`(模块出口)

把 `store` 模块加入模块表,并把 `NamedVolumeStore` re-export 出去。只改一行 + 加一行:

```rust
mod store;                                      // 新增:注册 store 模块(原本就有)

pub use store::{NamedVolumeStore, VolumeInfo};  // 原来是 pub use store::VolumeInfo;
```

改完:
```bash
make cli
```

### Step 3 — `src/boxlite/src/runtime/rt_impl.rs`(让 LocalRuntime 真正干活)

现在把 `impl VolumeBackend for LocalRuntime` 里每个返回 `Err(volumes_unsupported())`
的方法,改成委托给 `NamedVolumeStore`。整个 `impl` 块(rt_impl.rs:1824)替换为:

```rust
// Named-volume operations (separate from RuntimeBackend). Backed by the local
// filesystem store: each named volume is a directory `{home}/volumes/{id}`.
#[async_trait::async_trait]
impl super::volumes::VolumeBackend for LocalRuntime {
    async fn create_volume(&self) -> BoxliteResult<crate::volumes::VolumeInfo> {
        if self.0.shutdown_token.is_cancelled() {
            return Err(BoxliteError::Stopped(
                "Cannot create volume: runtime has been shut down".into(),
            ));
        }
        crate::volumes::NamedVolumeStore::new(self.0.layout.home_dir()).create()
    }

    async fn list_volumes(&self) -> BoxliteResult<Vec<crate::volumes::VolumeInfo>> {
        if self.0.shutdown_token.is_cancelled() {
            return Err(BoxliteError::Stopped(
                "Cannot list volumes: runtime has been shut down".into(),
            ));
        }
        crate::volumes::NamedVolumeStore::new(self.0.layout.home_dir()).list()
    }

    async fn get_volume(&self, id: &str) -> BoxliteResult<crate::volumes::VolumeInfo> {
        if self.0.shutdown_token.is_cancelled() {
            return Err(BoxliteError::Stopped(
                "Cannot get volume: runtime has been shut down".into(),
            ));
        }
        crate::volumes::NamedVolumeStore::new(self.0.layout.home_dir()).get(id)
    }

    async fn remove_volume(&self, id: &str, force: bool) -> BoxliteResult<()> {
        if self.0.shutdown_token.is_cancelled() {
            return Err(BoxliteError::Stopped(
                "Cannot remove volume: runtime has been shut down".into(),
            ));
        }
        crate::volumes::NamedVolumeStore::new(self.0.layout.home_dir()).remove(id, force)
    }
}
```

**讲解**:
- 每个方法先检查 `shutdown_token`——runtime 已关停就拒绝操作。这是本仓库所有 backend
  方法的一致模式(对照 `RuntimeBackend` 的其他方法)。
- `self.0` 是 `LocalRuntime` 内部的 `Arc<RuntimeImpl>`,`self.0.layout.home_dir()`
  给出 home 目录——**路径从已知根计算,绝不硬编码**。
- 原来底下的 `fn volumes_unsupported()` 辅助函数现在没人用了,**整个删掉**。
  (CLAUDE.md: 死代码立刻删。)

```bash
make cli
```

### Step 4 — `src/boxlite/src/rest/types.rs`(REST 客户端侧类型)

`rest/types.rs` 是 **REST 客户端**(boxlite runtime 连远程 API 时用的 wire 类型)。
`VolumeResponse` 要跟上新增的 `host_path` 字段,并能在 `to_volume_info` 里填进
`VolumeInfo.host_path`。

1) 文件顶部 `use` 加一行:
```rust
use std::path::PathBuf;
```

2) `VolumeResponse` 加一个字段(注意 `#[serde(default)]`,老服务器不返回它也能解析):
```rust
pub(crate) struct VolumeResponse {
    pub id: String,
    pub created_at: String,
    #[serde(default)]
    pub size_bytes: Option<u64>,
    /// Host directory backing this volume — lets a client resolve a volume id
    /// to a mount source (e.g. for volume mounts at box creation).
    #[serde(default)]
    pub host_path: Option<String>,
}
```

3) `to_volume_info` 构造 `VolumeInfo` 时填上 `host_path`:
```rust
impl VolumeResponse {
    pub fn to_volume_info(&self) -> crate::volumes::VolumeInfo {
        let created_at = chrono::DateTime::parse_from_rfc3339(&self.created_at)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .unwrap_or_else(|_| chrono::Utc::now());

        crate::volumes::VolumeInfo {
            id: self.id.clone(),
            created_at,
            size_bytes: self.size_bytes,
            host_path: self
                .host_path
                .as_deref()
                .map(PathBuf::from)
                .unwrap_or_default(),
        }
    }
}
```
`Option<String>` 用 `.as_deref().map(PathBuf::from)` 转成 `Option<PathBuf>`,
没有就 `unwrap_or_default()`(空路径)——因为 `VolumeInfo.host_path` 是必填的 `PathBuf`。

```bash
make cli
```

### Step 5 — `src/cli/src/commands/serve/types.rs`(服务器侧 wire 类型)

`serve/types.rs` 是 **REST 服务器**(`boxlite serve` 本地服务)的请求/响应类型。

1) `CreateBoxRequest` 加字段(在 `tty` 之后、`advanced` 附近随便放,保持 `#[serde(default)]`):
```rust
    /// Named-volume mounts to attach to the new box. Each `volume_id` is
    /// resolved server-side to the volume's host directory; the wire protocol
    /// never carries a client-selected host path.
    #[serde(default)]
    pub volumes: Vec<CreateVolumeMount>,
```

2) 新增 `CreateVolumeMount` 结构体:
```rust
/// One named-volume mount in a `CreateBoxRequest`.
///
/// Only the `volume_id` names the payload; the server resolves it to the
/// volume's host directory, so a client can never make the box mount an
/// arbitrary host path.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CreateVolumeMount {
    pub volume_id: String,
    pub guest_path: String,
    #[serde(default)]
    pub read_only: bool,
}
```

3) `VolumeResponse` 加 `host_path`(返回给客户端的卷元数据):
```rust
pub(super) struct VolumeResponse {
    pub id: String,
    pub created_at: String,
    pub size_bytes: Option<u64>,
    /// Host directory backing this volume — lets a client resolve a volume id
    /// to a mount source without a second lookup.
    pub host_path: String,
}
```

```bash
make cli
```

### Step 6 — `src/cli/src/commands/serve/mod.rs`(解析 + 拼装)

这是 serve 侧的核心接线。三处改动:

1) `volume_info_to_response` 填上 `host_path`:
```rust
fn volume_info_to_response(info: &boxlite::runtime::types::VolumeInfo) -> types::VolumeResponse {
    types::VolumeResponse {
        id: info.id.clone(),
        created_at: info.created_at.to_rfc3339(),
        size_bytes: info.size_bytes,
        host_path: info.host_path.to_string_lossy().into_owned(),
    }
}
```
`PathBuf.to_string_lossy()` 把路径转成字符串(非 UTF-8 用替代字符,不 panic)。

2) **新增** `resolve_volume_mounts`:把请求里的 `volume_id` 列表,逐个问 runtime 要卷,
得到物理目录,组装成 `VolumeSpec`:
```rust
/// Resolve requested named-volume mounts to concrete `VolumeSpec`s.
///
/// Each mount names a `volume_id`; the server maps it to the volume's host
/// directory via the runtime's volume backend. A missing volume surfaces as
/// `NotFound` (404), so a client can never select an arbitrary host path.
async fn resolve_volume_mounts(
    runtime: &BoxliteRuntime,
    mounts: &[CreateVolumeMount],
) -> Result<Vec<boxlite::runtime::options::VolumeSpec>, boxlite::BoxliteError> {
    let volume_handle = runtime.volumes()?;
    let mut specs = Vec::with_capacity(mounts.len());
    for m in mounts {
        if m.guest_path.trim().is_empty() || !m.guest_path.starts_with('/') {
            return Err(boxlite::BoxliteError::InvalidArgument(format!(
                "volume guest_path must be an absolute path, got {:?}",
                m.guest_path
            )));
        }
        let info = volume_handle.get(&m.volume_id).await?;
        specs.push(boxlite::runtime::options::VolumeSpec {
            host_path: info.host_path.to_string_lossy().into_owned(),
            guest_path: m.guest_path.clone(),
            read_only: m.read_only,
        });
    }
    Ok(specs)
}
```
- **边界校验在这做**:`guest_path` 必须非空且以 `/` 开头,否则 `InvalidArgument`(→ 400)。
- `runtime.volumes()?` 拿到 `VolumeHandle`(门面),`volume_handle.get(id).await?`
  才是真正下到 store 的那一步;卷不存在 → `NotFound`(→ 404)。

3) `build_box_options` 签名加一个 `volumes` 参数,并在构造 `BoxOptions` 时填进
`volumes` 字段:
```rust
fn build_box_options(
    req: &CreateBoxRequest,
    volumes: Vec<boxlite::runtime::options::VolumeSpec>,   // ← 新增参数
) -> Result<BoxOptions, boxlite::BoxliteError> {
    ...
    Ok(BoxOptions {
        ...
        volumes,        // ← 填进 BoxOptions.volumes
        ...
    })
}
```

```bash
make cli
```

### Step 7 — `src/cli/src/commands/serve/handlers/boxes.rs`(把两步串起来)

`create_box` handler 里,在调用 `build_box_options` **之前**先解析卷:
```rust
    let name = req.name.clone();
    let volumes = match resolve_volume_mounts(&state.runtime, &req.volumes).await {
        Ok(volumes) => volumes,
        // A missing volume surfaces as 404 via the runtime's NotFound mapping.
        Err(e) => return error_from_boxlite(&e),
    };
    let options = match build_box_options(&req, volumes) {
        ...
```
- 新增 `resolve_volume_mounts` 到顶部 `use super::super::` 导入里(它已经在 mod.rs 中)。
- 错误直接走 `error_from_boxlite`——`NotFound` 自然变成 404,不用手写。

```bash
make cli
```

### Step 8 — `src/cli/src/commands/serve/handlers/volumes.rs`(改注释)

`/v1/volumes` 的 handler 代码**本来就存在**(已经调 `runtime.volumes()`,只是后端一直
报 Unsupported)。文件顶部的模块注释是旧的,说后端返回 Unsupported——把它改成与实际
行为一致:
```rust
//! Named-volume handlers (`/v1/volumes`).
//!
//! These mirror the box handlers, delegating to `runtime.volumes()`, whose
//! local backend stores each volume in a directory under `{home}/volumes/`.
```

```bash
make cli
make test:integration:cli FILTER=volume
```

到这里,核心代码就全部敲完了。

---

## 五、安全边界(务必理解)

这个 issue 最容易被问、也最容易答错的部分:

1. **客户端永远发 `volume_id`,不发 `host_path`**。
   `CreateVolumeMount` 只有 `volume_id`/`guest_path`/`read_only` 三个字段,还带
   `deny_unknown_fields`。客户端想塞 `host_path` → 400。
2. **物理路径由服务器解析**。`resolve_volume_mounts` 通过 `runtime.volumes().get(id)`
   得到 `VolumeInfo.host_path`。而 store 的 `volume_dir` 守卫保证 id 不能是路径(`..`、`/` 等),
   所以客户端没法用一个畸形 id 把服务器引向任意目录。
3. **`anonymous` 是保留名**。store 的 `get`/`remove` 拒绝它,`list` 跳过它——CLI 的匿名卷
   不属于 serve 的 named-volume 管辖,不能被枚举、更不能被删除。
4. **为什么 `VolumeInfo.host_path` 还能暴露给客户端?** 因为它是"信息性"的:让客户端
   不用二次查询就知道一个卷对应哪个宿主目录(比如用于诊断)。但它**不能**用来发起挂载——
   挂载入口只接受 `volume_id`。

---

## 六、验证清单(全部通过才算完成)

```bash
make fmt:check:rust                     # 格式
make test:unit:rust                     # boxlite + boxlite-shared 全部单测
make test:integration:cli               # CLI 集成测试
make test:integration:cli FILTER=volume # 只看卷相关
```

手动冒烟(可选):
```bash
make cli
boxlite serve &                        # 后台起服务
curl -X POST http://localhost:3001/v1/volumes        # → 拿 volume_id
curl -X POST http://localhost:3001/v1/boxes -d '{
  "image":"alpine:3.19",
  "volumes":[{"volume_id":"<id>","guest_path":"/data"}]
}'
# 进 box 后 ls /data 应能看到卷目录里的内容
```

---

## 七、坑与心得(你大概率会遇到的)

- **类型级联**:给 `VolumeInfo` 加字段后,所有构造它的地方都要改
  (`store.rs::create`、`rest/types.rs::to_volume_info`、`serve/mod.rs::volume_info_to_response`)。
  编译器会逐个告诉你,别慌,按报错顺序补。
- **`cargo fmt` 会重排你的代码**:写完后一定要 `make fmt:rust`,否则 `fmt:check` 会红。
- **`?` 和 `map_err` 的区别**:`?` 负责"提前返回",`map_err` 负责"把错误类型翻译成业务错误"。
  本仓库错误信息要带资源 id(`volume not found: {id}`),别只写 `not found`。
- **改完一行就编译**:这个 issue 牵扯的类型链很长,攒着一口气改完再编译会很难定位。
  CLAUDE.md 和 development-workflow.md 都强调:每步编译,错误在产生的那个步骤消化掉。
