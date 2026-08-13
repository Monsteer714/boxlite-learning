## Summary

Implement named-volume creation and mounting for `boxlite serve`: `/v1/volumes`
goes from "every operation returns `Unsupported`" to a real filesystem store
(one directory per volume, `{home}/volumes/{id}`); `POST /v1/boxes` gains a
`volumes` field that mounts named volumes by `volume_id`. Clients only ever send
a `volume_id` — the server resolves the host path through the volume backend —
preserving the security boundary that a remote client cannot select an arbitrary
host path.

## Call graph

Before

```text
POST /v1/volumes · GET /v1/volumes · …   (VolumeBackend · src/boxlite/src/runtime/rt_impl.rs:1823)
                                           — every operation returns Unsupported
POST /v1/boxes
  └─ create_box           (handlers/boxes.rs:16)
       └─ build_box_options (serve/mod.rs:759) — BoxOptions.volumes always empty
```

After

```text
create_volume  (VolumeBackend · src/boxlite/src/runtime/rt_impl.rs:1824)
  └─ NamedVolumeStore::create (NamedVolumeStore · src/boxlite/src/volumes/store.rs:63)
     — BoxIDMint mints the id; mkdir {home}/volumes/{id}
list_volumes   (VolumeBackend · rt_impl.rs:1833)
  └─ NamedVolumeStore::list  (volumes/store.rs:82) — enumerates, skips anonymous/
get_volume     (VolumeBackend · rt_impl.rs:1842)
  └─ NamedVolumeStore::get   (volumes/store.rs:115) — missing directory → NotFound
remove_volume  (VolumeBackend · rt_impl.rs:1851)
  └─ NamedVolumeStore::remove(volumes/store.rs:124) — force tolerates a missing id

POST /v1/boxes {"volumes":[{"volume_id","guest_path","read_only"}]}
  └─ create_box          (handlers/boxes.rs:16)
       ├─ resolve_volume_mounts (serve/mod.rs:736) — volume_id → get_volume → host_path; missing → 404
       └─ build_box_options     (serve/mod.rs:759) — fills BoxOptions.volumes
```

## Changes

- `VolumeBackend for LocalRuntime` now delegates to `NamedVolumeStore`: create/list/get/remove for `/v1/volumes` actually hit the filesystem.
- `VolumeInfo` gains a `host_path` field (src/boxlite/src/volumes/store.rs:34), exposed to REST via `VolumeResponse.host_path`; serve mounting uses it to resolve a `volume_id` to the volume's host directory.
- `CreateBoxRequest` gains `volumes: Vec<CreateVolumeMount>` (src/cli/src/commands/serve/types.rs:59); each mount carries only `volume_id`/`guest_path`/`read_only`. `deny_unknown_fields` rejects a client smuggling in a `host_path`.
- `resolve_volume_mounts` (serve/mod.rs:736): `get_volume` validation (missing → 404) plus absolute-`guest_path` validation (invalid → 400).
- Tests: store unit tests (round-trip / list excludes anonymous / remove force / NotFound / traversal ids) plus serve wire-contract and resolve tests (the resolved `host_path` points at the volume directory).

## How to verify

- `make test:unit:rust`
- `make test:integration:cli FILTER=volume`
- `make fmt:check:rust`
- Manual: `boxlite serve`; `curl -X POST /v1/volumes` to get a `volume_id`; `curl -X POST /v1/boxes -d '{"image":"alpine:3.19","volumes":[{"volume_id":"<id>","guest_path":"/data"}]}'`; inside the box, `ls /data` shows the volume's contents.

## Risks / rollout

- REST now returns `host_path` to clients, informational only — mounting still requires a `volume_id`, so a client cannot use it to select an arbitrary host path (locked down by the wire-contract test).
- Backward compatible: `CreateBoxRequest.volumes` and `VolumeResponse.host_path` are both `#[serde(default)]`, so older clients and older servers are unaffected.
