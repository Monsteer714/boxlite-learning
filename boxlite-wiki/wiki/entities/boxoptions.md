---
type: entity
title: "BoxOptions"
created: 2026-08-12
updated: 2026-08-12
tags: [boxlite, configuration, sdk, rust, python]
related:
  - entities/box
  - entities/litebox
  - entities/simplebox
  - entities/codebox
  - entities/boxlite-runtime
  - concepts/allow-net
  - concepts/secret-injection
  - concepts/capability-overrides
  - concepts/copy-on-write-qcow2-disk
  - concepts/oci-image-caching
  - entities/gvproxy
  - concepts/boxlite-error-taxonomy
sources: ["README-20260812-1786500247075.md"]
---

# BoxOptions

## Overview

The canonical box configuration type. In the **Rust** API it is a core struct alongside `BoxliteRuntime`, `LiteBox`, `BoxCommand`, `RootfsSpec`, `VolumeSpec`, and `PortSpec`; in the **Python** SDK the same surface appears as constructor parameters to the box classes. It is the configuration target for every [[entities/box|Box]] creation.

## Parameters

| Parameter | Default | Notes |
|---|---|---|
| `image` | `"python:slim"` (Python SDK convenience wrappers only) | OCI URI `[registry/]repository[:tag]`; Docker Hub, GHCR, ECR, GCR |
| `network` | omitted → `{mode: "enabled", allow_net: []}` | `mode` `enabled`/`disabled`; `allow_net` outbound allowlist |
| `secrets` | — | Host-side secret substitution; placeholder `<BOXLITE_SECRET:{name}>` |
| `advanced.capabilities` | empty add/drop lists | Docker-compatible 14-capability baseline preserved |
| `cpus` | 1 | Range 1..host CPU count; shares-based scheduling |
| `memory_mib` | 512 | Range 128–65536; OOM kills the box |
| `disk_size_gb` | `None` (ephemeral) | 1–1024; QCOW2 at `~/.boxlite/boxes/{box-id}/disk.qcow2` |
| `working_dir` | `"/root"` | Must exist in image |
| `env` | `[]` | ⚠️ Values are **visible in box metadata** |
| `volumes` | `[]` | `(host_path, guest_path, "ro"\|"rw")`; virtiofs |
| `ports` | `[]` | `(host_port, guest_port, "tcp")` or dict with `guest_port` only (OS-selected host port); TCP only, UDP rejected |
| `auto_remove` | `True` | `False` keeps box after stop for restart via `runtime.get(box_id)` |

## Security-Critical Parameters

- **`network.allow_net`** — hostname rules are enforced via TLS SNI / HTTP Host (TCP only), so hostname-only allowlists deny all UDP egress; [[concepts/host-boxlite-internal|host.boxlite.internal]] egress is also governed here. See [[concepts/allow-net|Network Egress Allow-listing]].
- **`secrets`** — real values never enter the VM; the guest sees only placeholders. See [[concepts/secret-injection|Secret Injection]].
- **`advanced.capabilities`** — add/drop over the 14-capability baseline; malformed names rejected at the API boundary; stale clients rejected rather than ignored. See [[concepts/capability-overrides|Capability Overrides]].
- **`env` vs `secrets`** — a documented footgun: `env` values (API keys, passwords) are visible in box metadata, while `secrets` provides the safe path. Users coming from container habits will reach for `env` first.

## Notes

- **`EXPOSE` is metadata only** — OCI `EXPOSE` does not publish a host port; port publication requires an explicit `ports` entry (or `box.network.tunnel(port)` for one-connection handles).
- **Port mappings are host → box only** — for box → host loopback traffic, use `host.boxlite.internal:<port>`.
- Related Rust builder types — `BoxCommand`, `RootfsSpec`, `VolumeSpec`, `PortSpec` — compose with `BoxOptions`; their detailed APIs live in the Rust SDK reference (not yet ingested).
- Invalid configurations surface through the [[concepts/boxlite-error-taxonomy|BoxLite error taxonomy]] (`Config`, `Storage`, `Network`, `AlreadyExists`, etc.).
