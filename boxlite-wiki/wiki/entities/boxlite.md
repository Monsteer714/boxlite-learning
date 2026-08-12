# BoxLite

**Summary:** Open-source "compute substrate for AI agents"; runs OCI images in hardware-isolated micro-VMs. Embeddable as a library, usable as a CLI, deployable as a REST service or multi-tenant AWS control plane.

## Overview

BoxLite's tagline: *"The compute substrate for AI agents"* — "light enough to embed on your laptop, elastic enough to power an agentic cloud."

A Box is a hardware-isolated micro-VM that runs any OCI image and persists — agents install packages, write files, and resume across turns.

**License:** Apache 2.0

## The Four-Act Story

1. **Embed it** — library in your app (`pip install boxlite`; Python/Node/Go/Rust/C SDKs)
2. **Run it** — standalone CLI: `curl -fsSL https://sh.boxlite.ai | sh` then `boxlite run python:slim ...`
3. **Deploy it** — REST server: `boxlite serve` → "Listening on 0.0.0.0:8100"; every CLI command works with `--url`
4. **Distribute it** — deploy the control plane into AWS (multi-tenant, autoscaling)

## Features (condensed)

- **Execution:** async exec, streamed stdout/stderr + exit codes, PTY with live resize, timeout/workdir/env/run-as-user, entrypoint/cmd override
- **Isolation & security:** KVM/Hypervisor.framework per box, seccomp/sandbox-exec, cgroups/rlimits, `allow_net`, secret injection, env sanitization
- **Storage & state:** persistence across stop/restart, volume mounts, QCOW2 COW disk, file copy, clone/export/import `.boxlite`, detached boxes
- **Networking:** outbound internet, TCP port forwarding, tunnels, network metrics
- **Images:** pull+cache any OCI image, custom/private registries, custom rootfs
- **Observability:** per-box/runtime metrics, console logs, live stats
- **Interfaces:** Python/Node/Go/Rust/C SDKs, CLI, REST API (WebSocket exec, optional auth)

## Ecosystem

| Adopter | Role |
|---|---|
| **Databricks Omnigent** | Agent framework using BoxLite as a sandbox option |
| **Alibaba AgentScope Runtime** | Agent runtime via `CONTAINER_DEPLOYMENT=boxlite` |
| **ByteDance deer-flow** | Research agent framework using BoxLite as sandbox provider |

## Platform Matrix

| Platform | Status |
|---|---|
| macOS ARM64 | ✅ |
| Linux x86_64 | ✅ |
| Linux ARM64 | ✅ |
| Windows WSL2 | ✅ |
| macOS Intel | 🚀 coming |

**System requirements:** macOS 12+, KVM-enabled Linux, WSL2 with KVM support + `kvm` group.

## Architecture Summary

- **Embeddable runtime:** [[entities/boxlite-runtime|BoxLite Runtime]] — SQLite-philosophy library, no daemon
- **Isolation unit:** [[entities/box|Box]] — VM + Shim + Container
- **Security:** [[entities/jailer|Jailer]] — Firecracker-inspired defense-in-depth OS sandbox
- **Communication:** gRPC over vsock (ports 2695/2696) — see [[concepts/grpc-vsock-protocol|gRPC over vsock]]
- **Full architecture:** [[sources/architecture-2026-08-12|Architecture source]]

## SDK Status

| SDK | Technology | Status |
|---|---|---|
| **Python** | PyO3 + maturin | Available |
| **C** | FFI + cbindgen | Available |
| **Node.js** | napi-rs | ⚠️ Discrepancy — Architecture doc says "In Progress"; README presents as usable via npm badge |

---

## Related

- **Entity:** [[entities/boxlite-runtime|BoxLite Runtime]]
- **Entity:** [[entities/box|Box]]
- **Entity:** [[entities/boxlite-cli|BoxLite CLI]]
- **Entity:** [[entities/boxlite-control-plane|BoxLite Control Plane]]
- **Source:** [[sources/boxlite-readme|BoxLite README — Full Document]]
