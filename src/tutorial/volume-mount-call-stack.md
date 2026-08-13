# Volume 挂载调用栈：CLI bind mount vs serve named-volume mount

> 两分钟结论：**两条调用栈只在入站段不同**——一条从 CLI `-v` 解析 host 路径，一条从 REST 解析 volume_id。
> 两者在 `BoxOptions.volumes` 之后**完全共享同一条下游管线**，一路到 guest 内实际 mount。

## 一、两条命令

```bash
# A. CLI bind mount（已跑通）
boxlite create mybox -v /Users/monsteer/Desktop/testVolume:/testVolume alpine:3.19

# B. serve named-volume mount（方案）
curl -X POST http://<server>:3001/v1/boxes -d '{
  "image": "alpine:3.19",
  "volumes": [{"volume_id": "Ab3...", "guest_path": "/testVolume", "read_only": false}]
}'
```

## 二、调用栈总览

```
A. CLI 入口                          B. REST 入口
──────────────────────────           ──────────────────────────────
create -v host:guest                POST /v1/boxes
  │ to_box_options (create.rs:70)     │ create_box (serve/boxes.rs:16)
  ▼                                   ▼
VolumeFlags::apply_to (cli.rs:880)   build_box_options (serve/mod.rs:728)
  │ parse_volume_spec (cli.rs:782)    │ ══[待实现]══► volume_id → {home}/volumes/{id}
  ▼                                   ▼
        ┌────────────── 合流 ──────────────┐
        ▼  BoxOptions.volumes (options.rs:330)  ▼
        │
        ├─ jailer 授权      build_path_access (jailer/mod.rs:212)
        └─ 挂载配置          resolve_user_volumes → virtiofs → gRPC 下发
        │
        ▼
     guest 内实际 mount（box 里看到 host 数据）
```

## 三、上游差异：A vs B

| | A. CLI `-v host:guest` | B. serve `volume_id` |
|---|---|---|
| **入口** | `CreateArgs` + `-v`（`create.rs:10`） | `POST /v1/boxes`（`serve/handlers/boxes.rs:16`） |
| **语法** | `parse_volume_spec`：`host:guest[:ro]`，支持 Windows 盘符、匿名卷（`cli.rs:782`） | `CreateBoxRequest.volumes` 反序列化（**待实现**，`serve/types.rs:13`） |
| **host_path 来源** | 用户显式路径；相对路径 canonicalize（`cli.rs:896`）；匿名卷落 `{base}/volumes/anonymous/{ulid}`（`cli.rs:904`） | 服务端解析 `volume_id → {home}/volumes/{id}`，需先经 `get_volume` 校验存在 |
| **安全边界** | 无——本机用户任意路径 | **受限**——客户端无法让服务器挂载任意主机目录 |
| **产出** | `VolumeSpec{host_path, guest_path, read_only}`（`cli.rs:915`） | 同左，`host_path` 换成了 volume 存储目录 |

## 四、共享下游（两条一致）

从 `BoxOptions.volumes` 到 guest 挂载点，共 10 跳：

1. **沙箱授权** — `vmm/controller/spawn.rs:122` 把 `options.volumes` 传入 jailer；目录型 volume 变成 `PathAccess{path, writable}`（`jailer/mod.rs:212,329`）
2. **解析校验** — `resolve_user_volumes`（`vmm_spawn.rs:155` / `init/types.rs:50`）：确认 host_path 存在、canonicalize、取 owner uid/gid
3. **分类** — `classify_volume_share`（`share.rs:20`）：目录 → `Dir`；单文件 → `File(name)`
4. **VMM 共享器** — `GuestVolumeManager`（`guest_volume.rs:57`）+ `ContainerVolumeManager`（`container_volume.rs:39`）
5. **注册** — `add_volume`（`container_volume.rs:72`）→ `guest.add_fs_share(tag, host_path, ro, container_id)`（`guest_volume.rs:80`）；单文件先 staging 进 `shared_dir/user-volumes/{tag}`（`vmm_spawn.rs:202`）
6. **VMM 配置** — `build_vmm_config`（`guest_volume.rs:154`）→ libkrun attach virtio-fs / virtio-blk
7. **guest 下发** — `build_guest_mounts`（`guest_volume.rs:184`）→ `GuestInitConfig.volumes`（`guest_init.rs:76`）
8. **gRPC** — `run_guest_init`（`guest_init.rs:125`）：`Guest.Init` 发 Volume proto（`guest.rs:248`），`Container.Init` 发 BindMount proto（`container.rs:145`）
9. **guest 落地** — 约定路径 `/run/boxlite/shared/containers/{cid}/volumes/{name}` 挂 virtio-fs，再 bind 到用户指定 `destination`
10. **完成** — box 内访问挂载点，即访问 host 数据

## 五、关键发现

### 1. `volumes/` 目录体系已共用
- CLI 匿名卷：`{home}/volumes/anonymous/{ulid}`（`cli.rs:908`）
- serve named volume：`{home}/volumes/{volume-id}`（`layout.rs:83,104,172`）

同一套 `FilesystemLayout`，`prepare()` 已创建 `volumes_dir()`。**named volume 的物理位置是现成的。**

### 2. `TODO(#942)` = CLI 挂载 named volume 的预留点
`cli.rs:889-893`：`-v <name>:<guest>` 的 src 是裸名字时，应经 volume backend 解析到 named volume 的 mountpoint。与 serve 方案是同一能力的两个入口：

- CLI：`-v myvol:/data` → 裸名 `myvol` → named volume
- REST：`"volume_id": "Ab3..."` → named volume

### 3. 空位对照

| 能力 | REST 客户端 | serve 服务端 | CLI 本地 |
|---|---|---|---|
| named volume CRUD | ✅（`rest/runtime.rs:54`） | ❌（`rt_impl.rs:1824`） | ❌ 同一 LocalRuntime |
| box 挂载 named volume | — | ❌ `build_box_options` 无 volumes | ⏳ `TODO(#942)` |

## 六、实现工作项

**Part 1 — volume creation（让 `/v1/volumes` 复活）**

实现 `impl VolumeBackend for LocalRuntime`（`rt_impl.rs:1824`）：

| 操作 | 实现 |
|---|---|
| `create_volume` | `BoxIDMint` 生成 id（`id.rs:176`）→ `mkdir {home}/volumes/{id}` → 返回 `VolumeInfo`（`store.rs:18`） |
| `list_volumes` | 枚举 `volumes_dir()`（`layout.rs:175`） |
| `get_volume` | 目录存在性检查 |
| `remove_volume` | 删目录，`force` 容错 |

**Part 2 — box 挂载（`POST /v1/boxes`）**

1. `CreateBoxRequest` 加 `volumes` 字段（`serve/types.rs:13`）
2. `build_box_options` 解析：`get_volume(volume_id)` 校验 → 404 if missing → `host_path = {home}/volumes/{id}`（`serve/mod.rs:728`）
3. 导入路径同步决策（`runtime/import.rs:116`）：仅允许 volume_id 引用，继续拒绝任意 host_path

**Part 3（可选）— CLI 裸名挂载**

按 `TODO(#942)`：`-v <name>:<guest>` 且 name 非路径 → 查 named volume → 解析 host_path。
