# Research Log

## 2026-08-12

- Project created
## [2026-08-12] delete | README-20260812-1786497274198.md

Deleted source file and 0 wiki pages.
- 2026-08-12: Saved query page `key-takeaways-2026-08-12.md`


# Wiki Change Log

## 2026-08-12

### Ingestion
- Ingested source file: `README-20260812-1786498019699.md`

### Sources Created
- [[sources/boxlite-readme|BoxLite README]]

### Entities Created
- [[entities/boxlite|BoxLite]]
- [[entities/box|Box]]
- [[entities/simplebox|SimpleBox]]
- [[entities/boxlite-runtime|BoxLite Runtime]]
- [[entities/jailer|Jailer]]
- [[entities/boxlite-cli|BoxLite CLI]]
- [[entities/boxlite-control-plane|BoxLite Control Plane]]
- [[entities/databricks-omnigent|Databricks Omnigent]]
- [[entities/alibaba-agentscope-runtime|Alibaba AgentScope Runtime]]
- [[entities/bytedance-deer-flow|ByteDance deer-flow]]

### Concepts Created
- [[concepts/micro-vm|Micro-VM]]
- [[concepts/oci-image|OCI Image]]
- [[concepts/daemonless-embedding|Daemonless Embedding]]
- [[concepts/copy-on-write-qcow2|Copy-on-Write QCOW2 Disk]]
- [[concepts/allow-net|allow_net]]
- [[concepts/secret-injection|Secret Injection]]
- [[concepts/pty|PTY Support]]
- [[concepts/detached-boxes|Detached Boxes]]
- [[concepts/boxlite-archive|.boxlite Archives]]
- [[concepts/security-layers|Security Layers]]
- [[concepts/boxlite-rest-api|BoxLite REST API / WebSocket Exec]]

### Queries Created
- [[queries/key-takeaways-2026-08-12|Key Takeaways]]

### Comparisons Created
- [[comparisons/boxlite-vs-containers|BoxLite vs. Containers]]
- [[comparisons/boxlite-vs-full-vms|BoxLite vs. Full VMs]]
- [[comparisons/boxlite-vs-daemon-runtimes|BoxLite vs. Daemon-Based Runtimes]]
- [[comparisons/agent-sandbox-solutions|Agent Sandbox Solutions]]

### Synthesis Created
- [[synthesis/boxlite-in-ai-agent-infrastructure|BoxLite in the AI Agent Infrastructure Landscape]]

### Notes
- Source document is in English; all wiki content written in English per language rule.
- Schema was unavailable (0.0 KB binary); file structure inferred from existing wiki index.

## [2026-08-12] ingest | BoxLite README — Key Takeaways

- Ingested the BoxLite README summary as the wiki's seed document (`sources/key-takeaways-2026-08-12.md`).
- Created 10 entity pages: BoxLite, Box, SimpleBox, BoxLite Runtime, Jailer, BoxLite CLI, BoxLite Control Plane, Databricks Omnigent, Alibaba AgentScope Runtime, ByteDance deer-flow.
- Created 11 concept pages: Micro-VM, OCI Image, Daemonless Embedding, Copy-on-Write QCOW2 Disk, allow_net, Secret Injection, PTY Support, Detached Boxes, .boxlite Archives, Sandboxing Layers, REST API / WebSocket Exec.
- Noted caveats: performance/isolation claims are self-reported; ecosystem adoption requires verification; no security audit cited.
- Open questions flagged: verify adopters, find benchmarks, locate security audit, consider comparison page (BoxLite vs Docker/Firecracker/gVisor/E2B), check control-plane documentation.

# Wiki Log

## 2026-08-12 — Initial wiki seed
- Ingested `README-20260812-1786497626730.md` key takeaways.
- Created wiki index, core entities (BoxLite, Box, SimpleBox, BoxLite Runtime, Jailer, CLI, Control Plane), core concepts (Micro-VM, OCI Image, Daemonless Embedding, COW QCOW2, allow_net, Secret Injection, PTY, Detached Boxes, Archives, Sandboxing Layers, REST API/WebSocket Exec), and initial queries.

## 2026-08-12 — Architecture section ingested
- Ingested the Architecture section of the BoxLite README.
- **New source:** `sources/architecture-2026-08-12`
- **New entities:** LiteBox, Shim Controller, Guest Agent, Portal, libkrun, gvproxy, boxlite-shared
- **New concepts:** Lazy Initialization, Subprocess Isolation, gRPC over vsock (Portal protocol), OCI Image Caching, Pluggable VMM Architecture, Single-RwLock State, Custom Kernels (RC), Nested Virtualization (RC)
- **New comparisons:** gvproxy vs libslirp, virtiofs vs QCOW2, LiteBox vs SimpleBox
- **Updated entities:** BoxLite Runtime, Box, Jailer
- **Updated concepts:** Sandboxing Layers, Copy-on-Write QCOW2 Disk, OCI Image, Daemonless Embedding
- **Referenced for future ingestion:** `auto-stop-resume-design.md`, `container-capabilities.md`, `experimental/custom-kernel.md`, `experimental/nested-virtualization.md`, `boxlite/src/jailer/THREAT_MODEL.md`

# Wiki Log

## 2026-08-12 — Initial wiki seed
- Ingested `README-20260812-1786497626730.md` key takeaways.
- Created wiki index, core entities (BoxLite, Box, SimpleBox, BoxLite Runtime, Jailer, CLI, Control Plane), core concepts (Micro-VM, OCI Image, Daemonless Embedding, COW QCOW2, allow_net, Secret Injection, PTY, Detached Boxes, Archives, Sandboxing Layers, REST API/WebSocket Exec), and initial queries.

## 2026-08-12 — Architecture section ingested
- Ingested the Architecture section of the BoxLite README.
- **New source:** `sources/architecture-2026-08-12`
- **New entities:** LiteBox, Shim Controller, Guest Agent, Portal, libkrun, gvproxy, boxlite-shared
- **New concepts:** Lazy Initialization, Subprocess Isolation, gRPC over vsock (Portal protocol), OCI Image Caching, Pluggable VMM Architecture, Single-RwLock State, Custom Kernels (RC), Nested Virtualization (RC)
- **New comparisons:** gvproxy vs libslirp, virtiofs vs QCOW2, LiteBox vs SimpleBox
- **Updated entities:** BoxLite Runtime, Box, Jailer
- **Updated concepts:** Sandboxing Layers, Copy-on-Write QCOW2 Disk, OCI Image, Daemonless Embedding
- **Referenced for future ingestion:** `auto-stop-resume-design.md`, `container-capabilities.md`, `experimental/custom-kernel.md`, `experimental/nested-virtualization.md`, `boxlite/src/jailer/THREAT_MODEL.md`

## 2026-08-12 — Full README & run-command semantics ingested
- Ingested four additional source files.
- **New sources:** `sources/boxlite-readme`, `sources/run-command-semantics-fix`, `sources/sdk-run-semantics-api`, `sources/concurrent-exec-deadlock`
- **New concepts:** Run-Command Semantics (OCI Matrix), Exit Record (exit.json), Config-Gated Restart Refusal, Fork-in-Multithreaded-Process Hazard
- **New comparison:** boxlite run vs docker run
- **Updated entities:** BoxLite (four-act story, platform matrix, install), BoxLite CLI (docker-parity `run`), Guest Agent (musl/tokio constraints, deadlock hazard), SimpleBox (SDK run/attach/wait surface), BoxLite Control Plane (deployment flow)
- **Updated concepts:** Subprocess Isolation (zygote extension), REST API / WebSocket Exec (port 8100, `--url` parity)
- **Discrepancy recorded:** Node.js SDK status — Architecture doc says "In Progress" (napi-rs); full README presents as usable via npm badge.
- **Future leads:** `container-capabilities.md` (Linux capability API), `auto-stop-resume-design.md` (cloud auto-stop/auto-resume semantics — relevant to config-gated restart refusal)

# Wiki Log

## 2026-08-12 — Initial wiki seed
- Ingested `README-20260812-1786497626730.md` key takeaways.
- Created wiki index, core entities (BoxLite, Box, SimpleBox, BoxLite Runtime, Jailer, CLI, Control Plane), core concepts (Micro-VM, OCI Image, Daemonless Embedding, COW QCOW2, allow_net, Secret Injection, PTY, Detached Boxes, Archives, Sandboxing Layers, REST API/WebSocket Exec), and initial queries.

## 2026-08-12 — Architecture section ingested
- Ingested the Architecture section of the BoxLite README.
- **New source:** `sources/architecture-2026-08-12`
- **New entities:** LiteBox, Shim Controller, Guest Agent, Portal, libkrun, gvproxy, boxlite-shared
- **New concepts:** Lazy Initialization, Subprocess Isolation, gRPC over vsock (Portal protocol), OCI Image Caching, Pluggable VMM Architecture, Single-RwLock State, Custom Kernels (RC), Nested Virtualization (RC)
- **New comparisons:** gvproxy vs libslirp, virtiofs vs QCOW2, LiteBox vs SimpleBox
- **Updated entities:** BoxLite Runtime, Box, Jailer
- **Updated concepts:** Sandboxing Layers, Copy-on-Write QCOW2 Disk, OCI Image, Daemonless Embedding
- **Referenced for future ingestion:** `auto-stop-resume-design.md`, `container-capabilities.md`, `experimental/custom-kernel.md`, `experimental/nested-virtualization.md`, `boxlite/src/jailer/THREAT_MODEL.md`

## 2026-08-12 — Full README & run-command semantics ingested
- Ingested four additional source files.
- **New sources:** `sources/boxlite-readme`, `sources/run-command-semantics-fix`, `sources/sdk-run-semantics-api`, `sources/concurrent-exec-deadlock`
- **New concepts:** Run-Command Semantics (OCI Matrix), Exit Record (exit.json), Config-Gated Restart Refusal, Fork-in-Multithreaded-Process Hazard
- **New comparison:** boxlite run vs docker run
- **Updated entities:** BoxLite (four-act story, platform matrix, install), BoxLite CLI (docker-parity `run`), Guest Agent (musl/tokio constraints, deadlock hazard), SimpleBox (SDK run/attach/wait surface), BoxLite Control Plane (deployment flow)
- **Updated concepts:** Subprocess Isolation (zygote extension), REST API / WebSocket Exec (port 8100, `--url` parity)
- **Discrepancy recorded:** Node.js SDK status — Architecture doc says "In Progress" (napi-rs); full README presents as usable via npm badge.
- **Future leads:** `container-capabilities.md` (Linux capability API), `auto-stop-resume-design.md` (cloud auto-stop/auto-resume semantics — relevant to config-gated restart refusal)

## [2026-08-12] ingest | Claude Activity Export — 2026-08-12 (CLAUDE-20260812-1786500247186)

- Registered raw Claude activity export as [[sources/CLAUDE-20260812-1786500247186]]; presumed parent artifact of the six BoxLite source documents dated 2026-08-12.
- Content-level analysis deferred: the document text was not provided to the analysis step, so no new entities or concepts were extracted; source page created as pointer/stub.
- Flagged for re-analysis (re-submit the full source text) and duplicate-check against the existing extracted sources.

## 2026-08-12 ingest | boxlite-shared README

- Ingested `README-20260812-1786500247201.md` (boxlite-shared README — design-governance doc for the shared crate). Enriched [[entities/boxlite-shared]] with `ChannelConfig` (TCP/Unix/Vsock, `from_uri()`), `CoreError`/`Result<T>`, and the dual-use-only design principle; linked `ChannelConfig` to [[concepts/grpc-vsock-protocol]]. Flagged the `channel.rs` vs. "only error types" discrepancy for verification.

## [2026-08-12] ingest | Python Quick Start (BoxLite SDK)

- Added source page: [[sources/quickstart-python-20260812-1786500247131|Python Quick Start]] — official 5-minute BoxLite Python SDK tutorial
- Added entities: [[entities/codebox|CodeBox]], [[entities/browserbox|BrowserBox]], [[entities/computerbox|ComputerBox]]
- Added concept: [[concepts/box-api-hierarchy|Box API Hierarchy]] (Core vs Higher-level API tiers)
- Flagged tensions: `box.exec()` vs `Boxlite.run()` in SimpleBox; context-manager auto-cleanup vs [[concepts/detached-boxes|Detached Boxes]]; `pip install` vs `make dev:python`; CodeBox agent-primitive positioning
- 2026-08-12: Created query page `pip-install-vs-make-devpython-2026-08-12.md` from review


## [2026-08-12] ingest | Rust Quick Start

## [2026-08-12] ingest | Image Registry Configuration Guide

- Ingested the image-registry configuration guide; created source page, Docker Hub (docker.io) and Image Registry (BoxLite ImageRegistry) entities, and Image Registry Configuration + SDK Purity concepts; extended the wiki's narrative into the image-acquisition layer.

## [2026-08-12] ingest | REST API E2E Test Report and Runbook

- Ingested `rest-api-e2e-20260812-1786500247177.md` (source: [[sources/rest-api-e2e-20260812-1786500247177]]) — REST E2E runbook defining the public REST contract test flow, auth modes, and skip rules.
- Created entities: [[entities/rest-api-server]], [[entities/boxlite-runner]], [[entities/boxlite-ws-proxy-service]], [[entities/apps-e2e-suite]].
- Created concepts: [[concepts/rest-e2e-testing]], [[concepts/api-key-authentication]], [[concepts/oidc-authentication]], [[concepts/path-prefix-discovery]], [[concepts/rest-supported-coverage]].
- Flagged contradiction: `boxlite serve` (port 8100) vs NestJS REST API (port 3000) relationship unresolved.
- Flagged open questions: `boxlite-runner` vs embedded runtime relationship; REST image-ops gap (`pull`/`images` not REST-backed); what `BoxliteWsProxyService` proxies.

## [2026-08-12] ingest | BoxLite C SDK API Reference

- Ingested the normative C SDK API reference — `README-20260812-1786500247054.md` (`libboxlite` FFI surface).
- New pages: [[entities/c-sdk|C SDK (libboxlite)]], [[concepts/ffi-ownership-rules|FFI Ownership & Memory Rules]], [[concepts/post-and-drain|Post-and-Drain Async Callbacks]], [[concepts/one-shot-tunnels|One-Shot Network Tunnels]], [[comparisons/simple-api-vs-native-api|Simple API vs Native API]].
- Updated: [[entities/simplebox|SimpleBox]], [[entities/boxlite-runtime|BoxLite Runtime]], [[entities/box|Box]], [[entities/litebox|LiteBox]], [[concepts/sandboxing-layers|Sandboxing Layers]], [[concepts/allow-net|allow_net]] with C FFI details.
- Flagged for human review: version ambiguity (0.5.7 vs v0.2.0 migration), `boxlite_runtime_drain()` `int` return-type quirk, Linux-only capability options on macOS, C-SDK entity overlap with existing SDK pages.

## [2026-08-12] ingest | Node.js Quick Start

- Ingested the BoxLite Node.js Quick Start (`quickstart-nodejs-20260812-1786500247123.md`).
- Added source page; created entity stubs for the box-variant family (CodeBox, BrowserBox, ComputerBox, InteractiveBox) and the `@boxlite-ai/boxlite` npm package; created concepts for async disposal (`await using`) and the exec-vs-run distinction; expanded SimpleBox's documented API surface with `exec()`, `stop()`, and async disposal; recorded Node 18+ / TS 5.2+ / hardware-virtualization constraints.

## 2026-08-12 ingest | BoxLite README — How-to Guides

- Ingested [[sources/README-20260812-1786500247106|BoxLite README — How-to Guides]] (README-20260812-1786500247106.md)
- New entities: [[entities/codebox|CodeBox]], [[entities/browserbox|BrowserBox]], [[entities/computerbox|ComputerBox]]
- New concepts: [[concepts/port-publication|Port Publication]], [[concepts/network-tunnel|Network Tunnel]], [[concepts/host-boxlite-internal|host.boxlite.internal]], [[concepts/lifecycle-autostop-autoresume|AutoStop / AutoResume / AutoDelete]], [[concepts/resource-limits|Resource Limits & Tuning]], [[concepts/build-system|Build System & Make Targets]], [[concepts/box-state-store|Local State Store (~/.boxlite)]]
- Updated [[wiki/index.md]] and [[wiki/overview.md]]
- Flagged open questions: `allow_net` default, Auto* lifecycle doc availability, CodeBox internals, metrics I/O gap

## [2026-08-12] ingest | BoxLite C Quick Start

- Ingested `quickstart-c-20260812-1786500247114.md` (BoxLite C Quick Start).
- New pages: [[entities/boxlite-c-sdk|BoxLite C SDK]], [[concepts/simple-vs-native-api|Simple vs. Native API]], [[concepts/c-sdk-error-handling|C SDK Error Handling]].
- Updated: [[entities/boxlite-runtime|BoxLite Runtime]], [[entities/simplebox|SimpleBox]], [[entities/box|Box]] with the C binding surface.
- Open questions flagged: auto-start semantics vs. lazy init; `simple_run` exec-vs-run; runtime-vs-simple ownership models; non-standard error-code numbering (2/5/8/10).

## [2026-08-12] ingest | BoxLite E2E Test Suite README

- Ingested [[sources/README-20260812-1786500247239|BoxLite E2E Test Suite README]] — documented the full production path (SDK REST → API :3000 → runner :8080 → VM), the REST-only fixture constraint, the path-verification meta-test, and the two-sided regression script
- Added [[entities/boxlite-e2e-suite]]; concretized [[entities/boxlite-control-plane]] (apps/api :3000, apps/runner :8080, apps/proxy, bootstrap/teardown, `/etc/boxlite-secrets.env`) and [[entities/boxlite-runtime]] (`Boxlite.rest` vs `Boxlite.default()`)
- Added [[concepts/full-production-path-testing]], [[concepts/test-path-verification]], [[concepts/two-sided-regression-testing]]; disambiguated [[concepts/rest-api-websocket-exec]] (:3000 control-plane API vs :8100 `boxlite serve`); extended [[concepts/secret-injection]] with the bootstrap secrets lifecycle

## 2026-08-12 ingest | BoxLite README — Getting Started

- Ingested `README-20260812-1786500247097.md` (Getting Started section of the BoxLite README).
- Created source page [[sources/README-20260812-1786500247097|BoxLite README — Getting Started]].
- Created entity pages: [[entities/python-sdk|Python SDK]], [[entities/nodejs-sdk|Node.js SDK]], [[entities/rust-sdk|Rust SDK]], [[entities/c-sdk|C SDK]], [[entities/go-sdk|Go SDK]], [[entities/kvm|KVM]], [[entities/hypervisor-framework|Hypervisor.framework]], [[entities/wsl2|WSL2]].
- Created concept pages: [[concepts/platform-support-matrix|Platform Support Matrix]], [[concepts/boxlite-troubleshooting|Installation & Runtime Troubleshooting]].
- Updated the wiki index and overview.

## [2026-08-12] ingest | AutoStop, AutoResume, and AutoDelete — Specification

## [2026-08-12] ingest | CLAUDE.md — apps/dashboard (Face-Swap UI Rewrite)

- Ingested the `apps/dashboard` working-context file; added the console/frontend layer to the wiki (previously zero coverage).
- New source page: [[sources/CLAUDE-20260812-1786500247247|CLAUDE.md — apps/dashboard (Face-Swap UI Rewrite)]].
- New entities: [[entities/boxlite-dashboard|BoxLite Dashboard]], [[entities/boxlite-api-client|@boxlite-ai/api-client]], [[entities/boxlite-data-hooks|BoxLite Dashboard Data Hooks]], [[entities/msw-mock-service-worker|MSW (Mock Service Worker)]].
- New concepts: [[concepts/functional-contract-seam|Functional Contract Seam]], [[concepts/preserve-vs-rebuild|Preserve-vs-Rebuild Boundary]], [[concepts/provider-nesting-order|Load-Bearing Provider Nesting]], [[concepts/org-scoping|Organization Scoping]].
- Flagged layer distinction: dashboard socket.io/Svix realtime (control-plane layer) vs. runtime gRPC-over-vsock (in-VM layer) — keep separate.
- Open questions: dashboard `/api` ↔ control-plane backend relationship; open-source status of `apps/dashboard`; fullscreen-terminal PTY transport; PR #820 design tokens.

## [2026-08-12] ingest | BoxLite Node.js SDK API Reference (README-20260812-1786500247068.md)

- Added source page `wiki/sources/README-20260812-1786500247068.md`; created 7 entity pages (JsBoxlite, JsBox, CodeBox, BrowserBox, ComputerBox, InteractiveBox, BoxLite Error Types) and 5 concept pages (Network Tunnels, Port Publishing Semantics, Box Type Hierarchy, Single-Pass Stream Consumption, Create-Pipeline Staging Metrics). Flagged SimpleBox API-surface mismatch and missing SDK `run()` for human review.

## [2026-08-12] ingest | BoxLite CLI Reference

- Ingested [[sources/README-20260812-1786500247061|BoxLite CLI Reference]] — exhaustive `boxlite` CLI spec (21 subcommands, global options, env vars, exit codes, volume/port grammars, supply-chain verification)
- Created [[entities/boxlite-auth|BoxLite Auth]] entity
- Created concepts: [[concepts/supply-chain-verification|Supply-Chain Verification]], [[concepts/job-vs-service-boxes|Job vs Service Boxes]], [[concepts/port-publishing|Port Publishing]], [[concepts/anonymous-volumes|Anonymous Volumes]], [[concepts/capability-baseline|Capability Baseline]], [[concepts/cli-exit-codes|CLI Exit Codes]]
- Expanded [[entities/boxlite-cli|BoxLite CLI]] (full subcommand inventory, global options, precedence) and [[entities/boxlite-control-plane|BoxLite Control Plane]] (client-side auth/tunnel surface)
- Updated concepts: [[concepts/run-command-semantics|Run-Command Semantics]], [[concepts/exit-record|Exit Record]], [[concepts/secret-injection|Secret Injection]], [[concepts/detached-boxes|Detached Boxes]], [[concepts/config-gated-restart-refusal|Config-Gated Restart Refusal]], [[concepts/rest-api-websocket-exec|REST API / WebSocket Exec]]
- Updated [[comparisons/boxlite-run-vs-docker-run|boxlite run vs docker run]] with documented deviations

## 2026-08-12 ingest | BoxLite Python SDK API Reference

- Ingested source `README-20260812-1786500247030.md` (Python SDK API Reference).
- Created source page [[sources/README-20260812-1786500247030|BoxLite Python SDK — API Reference]].
- Added entities: BoxLite Python SDK, CodeBox, BrowserBox, ComputerBox, InteractiveBox, ImageRegistry, Execution, BoxLite Error Types.
- Added concepts: Box Types Hierarchy, Network Tunnels, Published Ports Tri-State, Greenlet Fiber Switching, Sync API.
- Added comparison: [[comparisons/ports-vs-tunnels|ports vs network.tunnel]].
- Flagged discrepancies for verification: memory default (512 vs 2048 MiB), ExecError vs ExecResult semantics, per-SDK SimpleBox surface mismatch, TimeoutError name shadowing, BoxStateInfo enum drift vs lifecycle concepts.

## [2026-08-12] ingest | BoxLite Runner README

- Ingested `README-20260812-1786500247216.md` — the Go runner implementation README (`apps/runner`).
- **New entities:** [[entities/boxlite-runner]] (Go HTTP server, :3003, one shared FFI client), [[entities/exec-manager]] (ManagedExec registry + cleanup loop), [[entities/nestjs-api]] (control-plane job issuer / health collector).
- **New concepts:** [[concepts/single-attach-exec]], [[concepts/exec-reaping-policy]], [[concepts/signal-whitelist]], [[concepts/attach-wire-protocol]], [[concepts/async-error-cache]], [[concepts/local-authoritative-state-sync]].
- **New comparison:** [[comparisons/runner-vs-boxlite-serve]] (Go production server vs Rust dev server).
- **Updated:** [[concepts/rest-api-websocket-exec]] (two-server distinction), [[entities/boxlite-control-plane]] (v2 jobs, healthchecks, STARTED tracking), [[concepts/pty-support]] (TTY merge, resize, WINCH), plus refreshed index and overview.

## [2026-08-12] ingest | BoxLite Infra (SST on AWS) Runbook

- Ingested `README-20260812-1786500247224.md` — the control-plane runbook: full SST v4/AWS stack (Edge: CloudFront/ALB/NLB; VPC: Api/Proxy/Runner with nested KVM; state: RDS/Redis/S3), guarded artifact-driven deploys, Runner operating rules, two-control-plane secrets, and cost (~$600/month).
- Extended [[entities/boxlite-control-plane|BoxLite Control Plane]] from a one-line stub to full architecture, deployment model, safety gates, and cost.
- Created entities: [[entities/boxlite-runner|BoxLite Runner]], [[entities/boxlite-api|BoxLite API]], [[entities/boxlite-proxy|BoxLite Proxy]], [[entities/sst-v4|SST v4]], [[entities/boxlite-deploy-workflows|BoxLite Deploy Workflows]], [[entities/auth0-oidc-idps|Auth0 / OIDC IdPs]], [[entities/cloudflare|Cloudflare]].
- Added 11 concepts: protected stateful Runner, symmetric artifact deployment, rolling binary upgrade, deployment-scope allowlist, self-verifying deploys, two-control-plane secrets, GitHub OIDC credentials, CloudFront WebSocket bypass, registry-side promotion, image-ref caching, version identity as artifact identity.
- Added query page [[queries/control-plane-open-questions|Control-Plane Open Questions]]; updated index and overview.

# Wiki Log

## 2026-08-12 — Initial wiki seed
- Ingested `README-20260812-1786497626730.md` key takeaways.
- Created wiki index, core entities (BoxLite, Box, SimpleBox, BoxLite Runtime, Jailer, CLI, Control Plane), core concepts (Micro-VM, OCI Image, Daemonless Embedding, COW QCOW2, allow_net, Secret Injection, PTY, Detached Boxes, Archives, Sandboxing Layers, REST API/WebSocket Exec), and initial queries.

## 2026-08-12 — Architecture section ingested
- Ingested the Architecture section of the BoxLite README.
- **New source:** `sources/architecture-2026-08-12`
- **New entities:** LiteBox, Shim Controller, Guest Agent, Portal, libkrun, gvproxy, boxlite-shared
- **New concepts:** Lazy Initialization, Subprocess Isolation, gRPC over vsock (Portal protocol), OCI Image Caching, Pluggable VMM Architecture, Single-RwLock State, Custom Kernels (RC), Nested Virtualization (RC)
- **New comparisons:** gvproxy vs libslirp, virtiofs vs QCOW2, LiteBox vs SimpleBox
- **Updated entities:** BoxLite Runtime, Box, Jailer
- **Updated concepts:** Sandboxing Layers, Copy-on-Write QCOW2 Disk, OCI Image, Daemonless Embedding
- **Referenced for future ingestion:** `auto-stop-resume-design.md`, `container-capabilities.md`, `experimental/custom-kernel.md`, `experimental/nested-virtualization.md`, `boxlite/src/jailer/THREAT_MODEL.md`

## 2026-08-12 — Full README & run-command semantics ingested
- Ingested four additional source files.
- **New sources:** `sources/boxlite-readme`, `sources/run-command-semantics-fix`, `sources/sdk-run-semantics-api`, `sources/concurrent-exec-deadlock`
- **New concepts:** Run-Command Semantics (OCI Matrix), Exit Record (exit.json), Config-Gated Restart Refusal, Fork-in-Multithreaded-Process Hazard
- **New comparison:** boxlite run vs docker run
- **Updated entities:** BoxLite (four-act story, platform matrix, install), BoxLite CLI (docker-parity `run`), Guest Agent (musl/tokio constraints, deadlock hazard), SimpleBox (SDK run/attach/wait surface), BoxLite Control Plane (deployment flow)
- **Updated concepts:** Subprocess Isolation (zygote extension), REST API / WebSocket Exec (port 8100, `--url` parity)
- **Discrepancy recorded:** Node.js SDK status — Architecture doc says "In Progress" (napi-rs); full README presents as usable via npm badge.
- **Future leads:** `container-capabilities.md` (Linux capability API), `auto-stop-resume-design.md` (cloud auto-stop/auto-resume semantics — relevant to config-gated restart refusal)

## 2026-08-12 — Image registry configuration ingested
- **New source:** `sources/image-registry-configuration-20260812-1786500247154`
- **New entities:** Docker Hub (docker.io), Image Registry (ImageRegistry)
- **New concepts:** Image Registry Configuration, SDK Purity (Deterministic Config)

## 2026-08-12 — CLI reference, Runner, Python SDK, and How-to guides ingested
- Ingested four additional source files.
- **New sources:** `sources/boxlite-cli-reference`, `sources/boxlite-runner`, `sources/python-sdk-api-reference`, `sources/how-to-guides`
- **New entities:** BoxLite Runner, CodeBox, BrowserBox, ComputerBox, InteractiveBox
- **New concepts:** Execution Lifecycle (Runner), Execution Attach Protocol (WS), Box State Sync, Async Artifact Operations, Specialty Box Types, Sync API via Greenlets
- **New comparison:** BoxLite Runner vs boxlite serve
- **Updated entities:** BoxLite CLI (full command surface), BoxLite Runtime (db layout, RUST_LOG), BoxLite Control Plane (Docker/K8s constraints), SimpleBox (exec options, shutdown), BoxLite (SDK surface)
- **Updated concepts:** Exit Record (CLI exit-code table), Config-Gated Restart Refusal (CLI create job semantics), Allow-Net (host.boxlite.internal, 192.168.127.254), Copy-on-Write QCOW2 Disk (operational guidance), Run-Command Semantics (EXPOSE metadata), REST API / WebSocket Exec (Runner vs serve), Detached Boxes (runner detach/reconnect), Secret Injection (Python Secret object)
- **Updated comparisons:** virtiofs vs QCOW2 (operational guidance), boxlite run vs docker run (`--rm`/`--detach` downgrade, `--rootfs`)
- **Future lead confirmed:** `auto-stop-resume-design.md` now explicitly referenced by how-to guides lifecycle section.

## [2026-08-12] ingest | BoxLite Rust API Reference

- Ingested README-20260812-1786500247042.md (Rust API Reference, crate `boxlite`) as the canonical SDK-contract source.
- Added sources/README-20260812-1786500247042; 7 entity pages (Execution, BoxCommand, BoxOptions, BoxliteError, BoxMetrics & RuntimeMetrics, ImageRegistry, BoxID & ContainerID); 4 concept pages (Box Lifecycle State Machine, Network Tunnels, Two-State Security Model, published_ports Tri-State Semantics); 1 query (Exit-Code Convention).
- Updated index and overview; preserved all prior entries.
- Flagged for resolution: exit-code convention contradiction (128+n vs negative signal), auto_remove default vs persistence, SimpleBox vs Rust BoxOptions, ULID→Base62 migration status.
- 2026-08-12: Created query page `claude-20260812-1786500247186md-vs-existing-extrac-2026-08-12.md` from review
- 2026-08-12: Created query page `claude-20260812-1786500247090md-may-be-the-raw-exp-2026-08-12.md` from review
- 2026-08-12: Created query page `clarify-createexec-semantics-vs-run-command-semant-2026-08-12.md` from review


# Wiki Log

## 2026-08-12 — Initial wiki seed
- Ingested `README-20260812-1786497626730.md` key takeaways.
- Created wiki index, core entities, concepts, and initial queries.

## 2026-08-12 — Architecture section ingested
- Ingested the Architecture section of the BoxLite README.
- Added LiteBox, Shim Controller, Guest Agent, Portal, libkrun, gvproxy, boxlite-shared.
- Added Lazy Initialization, Subprocess Isolation, gRPC over vsock, OCI Image Caching, Pluggable VMM, Single-RwLock State, Custom Kernels, Nested Virtualization.

## 2026-08-12 — Full README & run-command semantics ingested
- Added full readme source, run-command semantics fix, SDK run-command API, concurrent-exec deadlock.
- Added Run-Command Semantics, Exit Record, Config-Gated Restart Refusal, Fork-in-Multithreaded-Process Hazard.
- Updated BoxLite, BoxLite CLI, Guest Agent, SimpleBox, BoxLite Control Plane.

## 2026-08-12 — Image registry configuration ingested
- Added ImageRegistry entity, Docker Hub entity, Image Registry Configuration concept, SDK Purity concept.

## 2026-08-12 — CLI reference, Runner, Python SDK, How-to guides ingested
- Added CLI reference, Runner, Python SDK API reference, How-to guides sources.
- Added BoxLite Runner, CodeBox, BrowserBox, ComputerBox, InteractiveBox entities.
- Added Execution Lifecycle, Execution Attach Protocol, Box State Sync, Async Artifact Operations, Specialty Box Types, Sync API via Greenlets concepts.
- Added BoxLite Runner vs serve comparison.

## 2026-08-12 — Rust API reference ingested
- Added README-20260812-1786500247042 source.
- Added Execution, BoxCommand, BoxOptions, BoxliteError, BoxMetrics, ImageRegistry, BoxID & ContainerID entities.
- Added Box Lifecycle State Machine, Network Tunnels, Two-State Security Model, published_ports Tri-State concepts.

## 2026-08-12 — AI Agent Integration Guide ingested
- Added `sources/ai-agent-integration-20260812-1786500247170` source.
- Added `entities/securityoptions` entity covering the enabled/disabled master switch and development/standard/maximum presets.
- Updated wiki index with the new source and entity.
- The guide provides the operational mapping of the Two-State Security Model onto agent workloads, including the key lesson that `asyncio.wait_for()` does not kill guest processes — explicit `execution.kill()` is required.

## 2026-08-12 — synthesis | SimpleBox exec call chain

- Created [[synthesis/simplebox-exec-call-chain]] — end-to-end call-chain synthesis for `Boxlite.default() → BoxOptions → SimpleBox → exec()`: deferred creation, the exec pre-gates (shutdown token, config-gated restart refusal), the wait/kill lock split, the three-stage SIGTERM→SIGKILL timeout watcher, and Reaper/zygote zombie prevention.
- Linked to entities (SimpleBox, LiteBox, Execution, BoxCommand, BoxOptions, Portal, Guest Agent), concepts (lazy-init, single-RwLock, run-command semantics, exit-record, config-gated restart, fork hazard, portal), and sources (run-command-semantics-fix, concurrent-exec-deadlock).
- Updated [[wiki/index.md]] Synthesis section.