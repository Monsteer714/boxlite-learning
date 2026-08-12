---
type: overview
title: "Wiki Overview"
created: 2026-08-12
updated: 2026-08-12
tags: [overview, ai-agents, infrastructure, sandboxing, rust-sdk]
related:
  - sources/key-takeaways-2026-08-12
  - sources/README-20260812-1786500247042
  - concepts/box-lifecycle
  - entities/execution
  - concepts/network-tunnels
  - concepts/two-state-security-model
sources: ["key-takeaways-2026-08-12.md", "README-20260812-1786500247042.md"]
---

# Wiki Overview

This wiki tracks research into the compute and execution layer for AI agents — the infrastructure question of *where and how agents actually run*. It is built on two foundational sources: the BoxLite README summary (`key-takeaways-2026-08-12.md`), which introduced the thesis that agents should run in persistent, hardware-isolated micro-VMs rather than ephemeral containers or heavyweight full VMs, and the Rust API reference (`README-20260812-1786500247042.md`), which turns that thesis into a concrete, async-first SDK contract (crate `boxlite`, built on Tokio) with a persisted box lifecycle state machine, an execution/streaming model, distinct tunnel and port-publishing network mechanisms, a two-state security switch, observable boot metrics, and a 19-variant error taxonomy.

The central entity is **BoxLite**, an open-source (Apache 2.0) "compute substrate for AI agents." Its architecture decomposes into a runtime unit (**Box** — a hardware-isolated micro-VM running OCI images), the OS-level **Jailer**, the embedded **BoxLite Runtime** library (Python/Node/Go/Rust/C SDKs), a CLI, a REST server with WebSocket exec, and a deployable multi-tenant **Control Plane** for AWS. Three third-party ecosystem adopters — Databricks Omnigent, Alibaba AgentScope Runtime, and ByteDance deer-flow — provide the strongest objective traction evidence, though integration depth remains unverified. The Rust API reference adds the authoritative low-level surface beneath the SDKs: `BoxliteRuntime` singleton/factory methods, the `LiteBox` handle, the `BoxOptions`/`AdvancedBoxOptions` configuration surface, `ImageRegistry` search-order resolution, identifier formats (Base62 `BoxID` with a ULID→Base62 transition in progress), and the subsystem-mapping `BoxliteError` enum.

Conceptually, the wiki develops the technical vocabulary of agent-sandbox infrastructure. From the README lineage: micro-VMs vs containers vs full VMs, OCI image compatibility and caching, daemonless embedding, QCOW2 copy-on-write disks for cross-turn persistence, `.boxlite` archives, detached boxes, PTY support, `allow_net` egress allow-listing, secret injection, and a four-layer defense-in-depth sandboxing model. From the Rust API reference lineage: the **box lifecycle state machine** (Configured → Running → Stopping → Stopped, plus error-recovery Unknown, with `can_*` predicates), take-once execution streams (`BoxCommand` → `Execution` → `ExecResult`), the **one-shot network tunnel vs persistent port** distinction, the **`published_ports` tri-state staleness semantics**, the **two-state `SecurityOptions` model** with dev/standard/maximum presets, and the observable **6-stage boot pipeline** exposed through `BoxMetrics`.

A central analytical posture runs through all pages: superlative positioning claims ("stronger than a container, lighter than a VM," "real secrets never enter the VM") are treated as **hypotheses to verify, not established facts** — neither source cites benchmarks or security audits. The Rust API reference is authoritative for API semantics but contains no empirical data; the wiki therefore keeps an open-question ledger tracking the **exit-code convention contradiction** (128+n vs negative signal), the **`auto_remove` default's tension** with the persistent-box narrative, the **SimpleBox-vs-BoxOptions** abstraction relationship, the ongoing **ULID→Base62 identifier migration**, and the **LockId vs single-RwLock** conflation risk. As primary sources accumulate, the wiki will move from this SDK-contract baseline toward a verified, comparative map of the agent-compute landscape — against Docker, Firecracker, gVisor, and E2B, and against benchmark data whenever it becomes available.
