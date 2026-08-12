# Wiki Index

## Entities
- [[entities/boxlite|BoxLite]] — open-source "compute substrate for AI agents"; runs OCI images in hardware-isolated micro-VMs
- [[entities/box|Box]] — the persistent, hardware-isolated micro-VM runtime unit (VM + Shim + Container)
- [[entities/simplebox|SimpleBox]] — high-level embedded API object wrapping Box creation in SDKs; exposes `BoxOptions`, `attach()`, `wait()`, and `Boxlite.run()`
- [[entities/boxlite-runtime|BoxLite Runtime]] — embedded library component enabling daemonless, in-app use (Python/Node/Go/Rust/C SDKs)
- [[entities/securityoptions|SecurityOptions]] — security configuration object with enabled/disabled master switch and development/standard/maximum presets
- [[entities/litebox|LiteBox]] — per-Box runtime handle providing execution capabilities with lazy initialization
- [[entities/execution|Execution]] — run handle for a command in a box; take-once stdin/stdout/stderr streams, wait/kill/signal/resize_tty
- [[entities/boxcommand|BoxCommand]] — command builder (args, env, timeout, working_dir, user, tty)
- [[entities/box-options|BoxOptions (Rust Configuration Surface)]] — canonical box config: rootfs, volumes, network, secrets, ports, auto_remove, detach, advanced
- [[entities/boxlite-error|BoxliteError]] — 19-variant error taxonomy doubling as a subsystem map
- [[entities/box-metrics|BoxMetrics & RuntimeMetrics]] — per-box and runtime-wide metrics incl. 6-stage boot timing
- [[entities/image-registry|ImageRegistry]] — registry transport/TLS/search/auth config and search-order resolution
- [[entities/boxid|BoxID & ContainerID]] — Base62/hex identifier formats and the ULID→Base62 transition
- [[entities/shim-controller|Shim Controller]] — subprocess-based Box controller isolating libkrun process takeover
- [[entities/jailer|Jailer]] — OS-level sandboxing component (seccomp/sandbox-exec) guarding the shim process
- [[entities/portal|Portal]] — gRPC host–guest communication layer (GuestSession, Connection, service interfaces)
- [[entities/guest-agent|Guest Agent]] — in-guest gRPC server (boxlite-guest) for environment init, OCI lifecycle, and streaming exec
- [[entities/libkrun|libkrun]] — production VMM implementation (KVM/Hypervisor.framework, virtio devices, vsock)
- [[entities/gvproxy|gvproxy]] — default user-mode network backend based on gVisor (NAT/DHCP/DNS, port publishing, tunnels)
- [[entities/boxlite-shared|boxlite-shared]] — shared crate for data types, error definitions, and constants
- [[entities/boxlite-cli|BoxLite CLI]] — standalone `boxlite` binary for terminal usage; `boxlite run` has docker-parity semantics
- [[entities/boxlite-control-plane|BoxLite Control Plane]] — deployable multi-tenant AWS infrastructure
- [[entities/databricks-omnigent|Databricks Omnigent]] — agent framework using BoxLite as a sandbox option
- [[entities/alibaba-agentscope-runtime|Alibaba AgentScope Runtime]] — agent runtime using BoxLite via `CONTAINER_DEPLOYMENT=boxlite`
- [[entities/bytedance-deer-flow|ByteDance deer-flow]] — research agent framework using BoxLite as sandbox provider

## Concepts
- [[concepts/micro-vm|Micro-VM]] — hardware-virtualized VM with small footprint; "stronger than container, lighter than VM"
- [[concepts/oci-image|OCI Image]] — Docker-compatible container image format; BoxLite runs these unchanged
- [[concepts/oci-image-caching|OCI Image Caching]] — digest-addressed blob storage, layer deduplication, COW rootfs assembly
- [[concepts/daemonless-embedding|Daemonless Embedding]] — using BoxLite as an in-app library with no root/daemon
- [[concepts/lazy-initialization|Lazy Initialization]] — `create()` returns instantly; heavy work deferred until first use
- [[concepts/box-lifecycle|Box Lifecycle State Machine]] — Configured/Running/Stopping/Stopped/Unknown with `can_*` predicates; restartable persisted boxes
- [[concepts/subprocess-isolation|Subprocess Isolation]] — shim runs as a subprocess because libkrun process takeover never returns; zygote extension planned for fork-safety
- [[concepts/run-command-semantics|Run-Command Semantics (OCI Matrix)]] — `run IMAGE [COMMAND...]` makes COMMAND the container's PID 1; entrypoint+cmd = init
- [[concepts/exit-record|Exit Record (exit.json)]] — per-run exit file; `128+n` signal convention; presence-based guard
- [[concepts/config-gated-restart-refusal|Config-Gated Restart Refusal]] — finished boxes with a main command must not implicitly restart on exec/attach/cp
- [[concepts/fork-in-multithreaded-process-hazard|Fork-in-Multithreaded-Process Hazard]] — musl `__malloc_lock` deadlock class; zygote pattern as mitigation
- [[concepts/copy-on-write-qcow2-disk|Copy-on-Write QCOW2 Disk]] — per-box persistent storage enabling state across agent turns
- [[concepts/allow-net|Network Egress Allow-listing (allow_net)]] — egress control constraining agent network access
- [[concepts/network-tunnels|Network Tunnels (One-Shot vs Persistent)]] — consuming `BoxTunnel` connections vs persistent `PortSpec` listeners
- [[concepts/secret-injection|Secret Injection]] — "real secrets never enter the VM"; sanitized guest environment
- [[concepts/pty-support|PTY Support]] — interactive pseudo-terminal sessions for debugging/terminal UX
- [[concepts/detached-boxes|Detached Boxes]] — boxes that outlive the parent process
- [[concepts/boxlite-archives|BoxLite Archives (.boxlite)]] — export/import/clone format for portability and reproducibility
- [[concepts/sandboxing-layers|Sandboxing Layers (Defense-in-Depth)]] — KVM + seccomp/sandbox-exec + cgroups/rlimits + env sanitization
- [[concepts/two-state-security-model|Two-State Security Model]] — `SecurityOptions` enabled()/disabled() master switch and builder presets
- [[concepts/grpc-vsock-protocol|gRPC over vsock (Portal protocol)]] — gRPC on ports 2695/2696 with strict init sequence
- [[concepts/pluggable-vmm|Pluggable VMM Architecture]] — `Vmm` trait + `VmmInstance` + `VmmFactory`/`VmmKind`
- [[concepts/single-rwlock-state|Single-RwLock State]] — one `RwLock` for all mutable runtime state; lock-free `AtomicU64` metrics
- [[concepts/custom-kernel-rc|Custom Kernels (RC)]] — immutable per-box generations, checksum-verified, atomically published
- [[concepts/nested-virtualization-rc|Nested Virtualization (RC)]] — persisted opt-in `/dev/kvm` passthrough to the OCI workload
- [[concepts/rest-api-websocket-exec|REST API / WebSocket Exec]] — server-mode interface (`boxlite serve`, port 8100); `--url` gives CLI parity
- [[concepts/published-ports-tri-state|published_ports Tri-State Semantics]] — None vs Some([]) vs populated; local vs REST staleness

## Sources
- [[sources/key-takeaways-2026-08-12|BoxLite README — Key Takeaways]] — structured summary of the BoxLite README; the seed document for this wiki
- [[sources/architecture-2026-08-12|BoxLite README — Architecture]] — the architecture section of the README; canonical reference for BoxLite internals
- [[sources/boxlite-readme|BoxLite README — Full Document]] — the complete polished README (tagline, four-act story, features, ecosystem, platform matrix)
- [[sources/run-command-semantics-fix|Run-Command Semantics Fix]] — implementation report making `boxlite run` behave like `docker run`
- [[sources/sdk-run-semantics-api|SDK Run-Command Semantics (API Design)]] — design doc for exposing docker-style run through the SDKs
- [[sources/concurrent-exec-deadlock|Concurrent Exec Deadlock — Root Cause Analysis]] — critical post-mortem on musl fork hazard causing ~30–50% hangs
- [[sources/README-20260812-1786500247042|BoxLite Rust API Reference]] — canonical API contract for the Rust SDK (crate `boxlite`); async-first on Tokio
- [[sources/ai-agent-integration-20260812-1786500247170|AI Agent Integration Guide]] — practical embedding patterns for AI-agent workflows, including security presets and concurrency models

## Queries
- [[queries/clarify-createexec-semantics-vs-run-command-semant-2026-08-12|Clarify create/exec semantics vs run-command semantics]]
- [[queries/claude-20260812-1786500247090md-may-be-the-raw-exp-2026-08-12|CLAUDE-20260812-1786500247090.md may be the raw export behind existing sources]]
- [[queries/claude-20260812-1786500247186md-vs-existing-extrac-2026-08-12|CLAUDE-20260812-1786500247186.md vs. existing extracted sources]]
- [[queries/key-takeaways-2026-08-12|Key Takeaways]]
- [[queries/exit-code-convention|Exit-Code Convention: 128+n vs Negative Signal]] — reconciling `exit.json` and `ExecResult` signal conventions

## Comparisons
- [[comparisons/gvproxy-vs-libslirp|gvproxy vs libslirp]] — default gVisor-based backend vs QEMU user-mode networking
- [[comparisons/virtiofs-vs-qcow2|virtiofs vs QCOW2]] — host-directory mounts vs COW disk images
- [[comparisons/litebox-vs-simplebox|LiteBox vs SimpleBox]] — low-level runtime handle vs high-level SDK API
- [[comparisons/boxlite-run-vs-docker-run|boxlite run vs docker run]] — parity table and intentional deviations

## Synthesis
The runtime-semantics narrative arc connects four sources: the concurrent-exec deadlock (musl fork hazard) → run-command semantics fix (init-as-PID-1) → SDK run-command API (persona-driven surface) → full README (user-facing product story). The Rust API reference (README-20260812-1786500247042.md) adds the canonical SDK-contract layer beneath that story: the persisted lifecycle state machine, the execution/streaming model, the tunnel-vs-port network distinction, the two-state security switch, and the observable 6-stage boot pipeline. The AI Agent Integration Guide then maps that contract onto concrete agent workload patterns — sizing, security presets, concurrency models, and the critical `execution.kill()` lesson.

- [[synthesis/simplebox-exec-call-chain|SimpleBox exec Call Chain]] — end-to-end `Boxlite.default() → BoxOptions → SimpleBox → exec()` walk-through: deferred creation, exec pre-gates, split lock domains, the three-stage SIGTERM→SIGKILL timeout, and Reaper/zygote zombie prevention
