# 第 11 课：Volume — S3 对象存储到 Box 内部目录的完整链路

> **源文件**：
> - API: `apps/api/src/box/entities/volume.entity.ts`, `apps/api/src/box/services/volume.service.ts`, `apps/api/src/box/managers/volume.manager.ts`
> - Runner: `apps/runner/pkg/boxlite/volumes.go`, `apps/runner/pkg/boxlite/client.go`
> - Engine: `src/boxlite/src/volumes/`, `src/boxlite/src/litebox/init/tasks/vmm_spawn.rs`
> - Guest: `src/guest/src/storage/volume.rs`, `src/guest/src/storage/virtiofs.rs`
> **学习目标**：理解 Volume 从 S3 Bucket 到 Box 内部目录的四层挂载链。

## Volume 是什么？

Volume 是 BoxLite 的**持久化存储**。与 Box 的生命周期解耦——Box 可以停止、销毁、重建，
Volume 中的数据始终保留。底层基于 **S3 对象存储**（生产 AWS S3，本地 MinIO）。

## 四层挂载链

这是理解 Volume 系统最关键的架构图：

```
Box 内部容器                              用户 mountPath="/data"
  │                                        ↑
  │  ④ OCI bind mount                     bind mount
  │     └─ /run/boxlite/shared/containers/<cid>/volumes/uservol0 → /data
  │
Guest VM 内核
  │  ③ virtio-fs 挂载                     virtiofs 内核模块
  │     └─ tag="uservol0" → /run/boxlite/shared/containers/<cid>/volumes/uservol0
  │
  │  virtio-fs (FUSE over virtio)
  │
宿主机 (Runner EC2 / macOS)
  │  ② S3 FUSE 挂载                        mount-s3 用户态文件系统
  │     └─ /mnt/boxlite-volume-<volumeId>
  │         或 /mnt/boxlite-volume-<volumeId>/<subpath>  (如果指定了 subpath)
  │
  │  ① S3 API                              HTTP
  │
S3 / MinIO                               bucket: boxlite-volume-<volumeId>
```

**一句话总结**：S3 Bucket → `mount-s3` FUSE → virtio-fs → Container bind mount。

## Layer 1：API — Volume 的创建与管理

### Volume 实体（`volume.entity.ts`，51 行）

```typescript
@Entity()
@Unique(['organizationId', 'name'])
export class Volume {
  @PrimaryGeneratedColumn('uuid')
  id: string

  organizationId?: string
  name: string
  state: VolumeState        // creating → ready → pending_delete → deleting → deleted
  errorReason?: string

  getBucketName(): string {
    return `boxlite-volume-${this.id}`   // ← S3 bucket 名称由此而来
  }
}
```

### VolumeState 状态机

```
PENDING_CREATE ──► CREATING ──► READY
                                │
                                ▼
                           PENDING_DELETE ──► DELETING ──► DELETED
```

### VolumeService.create()（`volume.service.ts:38`）

1. 检查 `s3.endpoint` 是否配置（没配置 → 拒绝，因为需要 S3/MinIO）
2. `name` 默认为 `id`（uuid）
3. 检查组内名称唯一
4. 保存时 `state = PENDING_CREATE`

### VolumeManager Cron（`volume.manager.ts:131`，每 5 秒）

```typescript
@Cron(CronExpression.EVERY_5_SECONDS)
async processPendingVolumes() {
  // 1. 找所有 PENDING_CREATE / PENDING_DELETE 的 volume
  // 2. 每个 volume 用 Redis 锁（防止多实例并发处理）
  // 3. 分发到 handlePendingCreate / handlePendingDelete
}
```

#### handlePendingCreate（第 199 行）：

```typescript
// 1. 在 S3/MinIO 中创建 bucket
await s3.send(new CreateBucketCommand({
  Bucket: `boxlite-volume-${volume.id}`
}))

// 2. 打标签（方便 AWS 成本分析）
await s3.send(new PutBucketTaggingCommand({
  Tagging: {
    TagSet: [
      { Key: 'VolumeId', Value: volume.id },
      { Key: 'OrganizationId', Value: volume.organizationId },
      { Key: 'Environment', Value: config.environment },
    ]
  }
}))

// 3. 更新 entity 状态
volume.state = CREATING → READY
```

#### handlePendingDelete（第 261 行）：

```typescript
// 1. 删除 S3 bucket（非空则报错 — 用户必须先清空）
await deleteS3Bucket(`boxlite-volume-${volume.id}`)

// 2. 重命名 entity（释放原名称）
volume.name = `${originalName}-deleted`
volume.state = DELETING → DELETED
```

### 删除保护（`volume.service.ts:74`）

```typescript
async delete(volumeId: string) {
  // 必须有 box 引用这个 volume 就不能删除
  const refs = await boxRepo.find({
    where: { volumes: JsonContains([{ volumeId }]) }
  })
  if (refs.some(b => b.state !== DESTROYED && b.state !== ARCHIVED)) {
    throw new ConflictException('volume has active boxes')
  }
}
```

查询用的是 Postgres JSONB `@>` 操作符：`WHERE volumes @> '[{"volumeId":"xxx"}]'`。

### mountPath 校验（`volume-mount-path-validation.util.ts`）

```typescript
// 必须满足：
// - 绝对路径（以 / 开头）
// - 不是 /
// - 不包含 .. / . / //
// - 不在系统目录下: /proc /sys /dev /boot /etc /bin /sbin /lib /lib64

// subpath:
// - 不以 / 开头
// - 不包含 .. / //
```

## Layer 2：Runner — S3 FUSE 挂载

### VolumeMount 数据结构

每个 Volume 在 Runner 侧被映射为一个 `VolumeDTO`：

```go
type VolumeDTO struct {
  VolumeId  string
  MountPath string   // Box 内的目标路径，如 "/data"
  Subpath   *string  // S3 key 前缀，如 "users/alice"
}
```

### 挂载底座路径（`volumes.go:44`）

```go
func getVolumeMountBasePath() string {
    // 开发环境 → /tmp
    // 生产环境 (AWS) → /mnt
}
// 每个 volume 的宿主机路径:
// /mnt/boxlite-volume-<volumeId>
```

### getVolumeMounts() — 核心挂载逻辑（第 51 行）

```go
func getVolumeMounts(ctx context.Context, volumes []dto.VolumeDTO) ([]boxlite.VolumeMount, error) {
    for _, v := range volumes {
        basePath := "/mnt/boxlite-volume-" + v.VolumeId   // ①

        // 去重：同一 volume 只 mount 一次（用于多 Box 共享 volume）
        ensureVolumeFuseMounted(ctx, v.VolumeId, basePath)  // ②

        sourcePath := basePath
        if v.Subpath != nil {
            // subpath 指向 S3 中的子目录
            sourcePath = basePath + "/" + *v.Subpath         // ③
            os.MkdirAll(sourcePath, 0755)
        }

        mounts = append(mounts, boxlite.VolumeMount{
            HostPath:  sourcePath,    // /mnt/boxlite-volume-xxx/project-a
            MountPath: v.MountPath,   // /data (Box 内部路径)
        })
    }
}
```

### ensureVolumeFuseMounted() — S3 FUSE 挂载（第 122 行）

```go
func ensureVolumeFuseMounted(ctx, volumeId, mountPath string) error {
    mu.Lock()  // 每个 volume 一把锁，防止并发重复 mount
    defer mu.Unlock()

    // 1. 已挂载？→ 跳过
    if isDirectoryMounted(mountPath) { return nil }

    // 2. 创建挂载点目录
    os.MkdirAll(mountPath, 0755)

    // 3. 执行 mount 命令
    cmd := getMountCmd(volumeId, mountPath)
    cmd.Run()

    // 4. 等挂载就绪（50 次 × 100ms = 5s）
    waitForMountReady(mountPath, 50, 100*time.Millisecond)
}
```

### getMountCmd() — 实际的 mount 命令（第 215 行）

```go
// mount-s3 --allow-other --allow-delete --allow-overwrite \
//   --file-mode 0666 --dir-mode 0777 \
//   <bucketName> <mountPath>

// AWS 环境检测到 systemd：用 systemd-run --scope 包裹（资源隔离）
// 否则直接 exec
```

`mount-s3` 是 AWS 官方的 S3 FUSE 驱动。关键参数：
- `--allow-other`：允许非 root 用户访问
- `--allow-delete`：允许删除文件
- `--file-mode 0666 --dir-mode 0777`：宽权限（Box 内部由 virtio-fs + auto-idmap 控制）

### 挂载记录与清理

**recordBoxVolumeMounts**：记录 Box 使用了哪些宿主路径 → JSON 文件

```
/mnt/.boxlite-volume-mounts/<boxId>.json = {boxId: "xxx", paths: ["/mnt/boxlite-volume-abc"]}
```

**CleanupOrphanedVolumeMounts**：定时扫描 `/mnt/boxlite-volume-*`
- 跳过已被某个 Box 记录的路径
- 跳过最近创建（< 120s）的路径（可能正在被另一个 Runner 的并发请求挂载）
- 对孤儿挂载：`umount` + `RemoveAll`

## Layer 3：Engine — virtio-fs 共享

### VolumeSpec → Rust 引擎（`runtime/options.rs:634`）

```rust
pub struct VolumeSpec {
    pub host_path: String,    // Runner 传来的宿主机路径
    pub guest_path: String,   // 宿主机路径在 Box 内的挂载目标
    pub read_only: bool,
}
```

### resolve_user_volumes（`litebox/init/types.rs:50`）

```rust
for (i, spec) in options.volumes.iter().enumerate() {
    // 1. 规范化路径
    let canonical = std::fs::canonicalize(&spec.host_path)?;

    // 2. 分类：目录 vs 单文件
    let share = classify_volume_share(&canonical)?;
    //   - Dir(PathBuf) → 直接共享目录
    //   - File(String)  → 单文件模式：stage 到共享目录

    // 3. tag = uservol0, uservol1, ...
    let tag = format!("uservol{}", i);

    // 4. 记录宿主端 owner uid/gid（用于 auto-idmap）
    let meta = std::fs::metadata(&canonical)?;

    volumes.push(ResolvedVolume {
        tag, host_path, guest_path,
        owner_uid: meta.st_uid(), owner_gid: meta.st_gid(),
        ...
    });
}
```

### 单文件模式 — stage_single_file（`volumes/staging.rs`）

```rust
pub fn stage_single_file(src: &Path, dest_dir: &Path, name: &str, ro: bool) -> Result<()> {
    if ro {
        // 只读：复制文件（启动时快照，之后宿主机修改不影响 Box）
        std::fs::copy(src, dest_dir.join(name))?;
    } else {
        // 读写：hard link（必须同文件系统；EXDEV = 跨设备 → 报错）
        std::fs::hard_link(src, dest_dir.join(name))?;
    }
}
```

**为什么只读用 copy，读写用 hard link？**

- 只读 copy = 快照语义：Box 启动后宿主机的修改不影响 Box 内的文件
- 读写 hard link = 共享语义：Box 和宿主机共享同一个 inode，实时同步
- hard link 要求同文件系统（`EXDEV` 表示跨设备）

### vmm_spawn.rs — 装配到 VM 配置（第 155-231 行）

```rust
// 1. 解析用户 volumes
let user_vols = resolve_user_volumes(&options.volumes)?;

// 2. 创建 GuestVolumeManager
let mut volume_mgr = GuestVolumeManager::new();

// 3. 总是添加 SHARED virtiofs share（系统共享目录）
volume_mgr.add_fs_share(ShareConfig {
    tag:       "BoxLiteShared",
    host_path: layout.shared_dir(),
    read_only: false,
});

// 4. 添加 rootfs 块设备
volume_mgr.add_block_device(BlockDeviceConfig {
    block_id:  "rootfs",
    disk_path: rootfs_disk_path,
});

// 5. 用 ContainerVolumeManager 为容器注册 bind mount
for vol in &user_vols {
    container_mgr.add_volume(container_id,
        vol.tag, vol.host_path, vol.guest_path, vol.read_only,
        vol.owner_uid, vol.owner_gid, vol.subpath);
}

// 6. 生成 VM 配置
let vmm_cfg = volume_mgr.build_vmm_config();
// → FsShares: [{tag: "BoxLiteShared", ...}, {tag: "uservol0", ...}]
// → BlockDevices: [{block_id: "rootfs", ...}]

let guest_mounts = volume_mgr.build_guest_mounts();
// → Guest Agent 协议的 VolumeConfig 列表
```

## Layer 4：Guest — Container bind mount

### Guest Agent 挂载（`storage/volume.rs:63`）

```rust
fn mount_volume(cfg: &VolumeConfig) -> Result<()> {
    let mount_point = resolve_mount_point(cfg.tag);
    // "uservol0" → /run/boxlite/shared/containers/<cid>/volumes/uservol0

    match cfg.source {
        Virtiofs(tag) => {
            // mount -t virtiofs <tag> <mount_point>
            nix::mount::mount(Some(tag), &mount_point, Some("virtiofs"), flags, None)
        }
        BlockDevice => { /* ... */ }
    }
}
```

### Container OCI bind mount（`container/spec.rs:173`）

```rust
// 将 virtiofs 挂载点 bind mount 到容器的用户指定路径
// /run/boxlite/shared/containers/<cid>/volumes/uservol0 → /data
oci_spec.add_mount(Mount {
    source:      "/run/boxlite/shared/containers/<cid>/volumes/uservol0",
    destination: "/data",
    options:     ["bind", "rw"],  // 或 ["bind", "ro"]
})
```

### Auto ID Map（`container/lifecycle.rs:146`）— 权限映射

当 volume 的宿主端 owner uid 与容器内用户 uid 不同时：

```rust
// 宿主端：volume 目录属于 uid=1000 的用户
// 容器内：以 uid=1001 的用户运行
// 解决方案：remap_mount() — 交换 uid 映射
//   1000 ↔ 1001，完整范围 idmap
// 结果：容器内 uid=1001 的用户可以读写 volume
```

## 完整生命周期

### 创建 Volume

```
POST /volumes
  ↓
VolumeService.create() → state=PENDING_CREATE
  ↓
VolumeManager Cron (5s)
  ↓
CreateBucketCommand('boxlite-volume-<id>')
  ↓
state → READY
```

### 挂载 Volume 到 Box

```
POST /api/box { volumes: [{volumeId, mountPath:"/data", subpath?}] }
  ↓
BoxService.create()
  ├─ validateVolumes() — 所有 volume 必须 READY
  ├─ box.volumes = [{volumeId, mountPath, subpath}]
  └─ 事件 → Job(CREATE_BOX, payload.volumes=[...])
       ↓
Runner Executor
  ├─ getVolumeMounts()
  │    ├─ ensureVolumeFuseMounted() → mount-s3
  │    └─ 构建 VolumeMount{HostPath, MountPath}
  └─ boxliteClient.Create(WithVolume(hostPath, mountPath))
       ↓
BoxLite Engine
  ├─ resolve_user_volumes()
  ├─ vmm_spawn: 装配 virtio-fs share + block device
  └─ Guest Agent: 挂载 virtiofs → bind mount 到 /data
```

### Box 重启后恢复 Volume（关键！）

```
Runner: Client.Start(boxId, metadata)
  ↓
ensureVolumeMountsFromMetadata(ctx, boxId, metadata)
  ├─ 从 metadata 解析出 volumeId/mountPath/subpath
  ├─ 检查 /mnt/boxlite-volume-<id> 是否已挂载
  │    ├─ 已挂载 → 跳过（S3 数据一直都在）
  │    └─ 未挂载 → ensureVolumeFuseMounted()
  └─ recordBoxVolumeMounts() → 更新挂载记录
       ↓
bx.Start(ctx)  // Box 重新启动，virtio-fs 重建 bind mount
```

**Volume 中的数据始终在 S3 中**，与 Box VM 的生命周期无关。重启只是重建挂载链。

### 销毁 Box 时清理

```
Runner: Client.Destroy(boxId)
  ↓
removeBoxVolumeMountRecord(boxId)
  ↓
CleanupOrphanedVolumeMounts()
  ├─ 扫描 /mnt/boxlite-volume-*
  ├─ 不在任何记录中的 → umount + 删除目录
  └─ (被其他 Box 引用的 → 保留)
```

### 删除 Volume

```
DELETE /volumes/:id
  ↓
VolumeService.delete()
  ├─ 检查：是否有活跃 Box 引用？
  │    SELECT * FROM box WHERE volumes @> '[{"volumeId":"xxx"}]'
  │    有 → 409 Conflict
  └─ state → PENDING_DELETE
       ↓
VolumeManager Cron
  ├─ DeleteBucket → state=DELETING
  └─ entity name += "-deleted" → state=DELETED
```

## 关键设计思想

1. **Volume 与 Box 生命周期解耦**：数据在 S3 中，Box 只是挂载到它。Box 停止/销毁不影响数据

2. **四层挂载每层职责清晰**：
   - S3 → 持久性保证
   - mount-s3 → 将对象存储变为 POSIX 文件系统
   - virtio-fs → 将宿主机目录共享进 VM（比 9p 性能好得多）
   - Bind mount → 将共享目录暴露到容器内的用户指定路径

3. **单文件模式**：`subpath` 支持 + `stage_single_file` 实现了细粒度的文件共享（不只是整个目录）

4. **Auto ID Map**：解决了"宿主端 uid ≠ 容器内 uid"的权限问题，无需用户手动配置

5. **Subpath 支持**：不同 Box 可以挂载同一个 Volume 的不同子目录，实现多租户共享存储

6. **引擎层不实现 Volume Backend**：`rt_impl.rs` 中 `VolumeBackend` 返回 `Unsupported`，
   持久性由 S3 + mount-s3 在更上层处理。这是刻意的分层——引擎不需要知道存储是 S3 还是本地盘

---

**上一课**：[第 10 课：BoxLite Engine 内核](./10-boxlite-engine.md)
