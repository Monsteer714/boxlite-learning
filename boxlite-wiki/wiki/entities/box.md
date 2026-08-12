---
type: entity
title: "Box"
created: 2026-08-12
updated: 2026-08-12
tags: [runtime, micro-vm, lifecycle, states]
related:
  - sources/architecture-2026-08-12
  - sources/auto-stop-resume-20260812-1786500247161
  - entities/boxlite-control-plane
  - entities/simplebox
  - entities/litebox
  - concepts/auto-stop-resume-delete
  - concepts/copy-on-write-qcow2-disk
  - concepts/config-gated-restart-refusal
sources: ["architecture-2026-08-12.md", "auto-stop-resume-20260812-1786500247161.md"]
---

# Box

## Definition

The persistent, hardware-isolated micro-VM runtime unit of BoxLite — a VM plus shim plus container running an OCI image. A Box is the unit of isolation, the unit of persistence, and the subject of the lifecycle state machine.

## Lifecycle States

The Box lifecycle uses the existing state machine — **no new `Paused` state** was introduced for automatic policies:

- **`STARTED`** — the VM is running and the container workload is active.
- **`STOPPED`** — the VM is stopped; persistent disk survives, memory does not.
- **`FINISHED`** — the main command exited; an [[concepts/exit-record|exit record]] is present.

## Automatic Transitions

Per the [[sources/auto-stop-resume-20260812-1786500247161|AutoStop/AutoResume/AutoDelete specification]], the [[entities/boxlite-control-plane|control plane]] can drive transitions automatically:

- **`STARTED` → `STOPPED`** — after `auto_stop` seconds with no qualifying activity (see [[concepts/activity-semantics|Activity Semantics]]).
- **`STOPPED` → `STARTED`** — on the next Exec/Files/WebSocket operation (AutoResume); the control plane submits or joins a Start operation, and concurrent requests coalesce on the transition.
- **`STOPPED` → deleted** — after `auto_delete` seconds (AutoDelete); also armed by manual Stop.

A `STOPPED` box is AutoResume-eligible; a `FINISHED` box is protected by [[concepts/config-gated-restart-refusal|Config-Gated Restart Refusal]]. This boundary is implied by the specifications but not explicitly stated in either.

## Persistence Contract

Stop preserves the persistent [[concepts/copy-on-write-qcow2-disk|QCOW2 disk]] and mounted volumes; it drops memory, processes, terminals, and network connections. AutoResume rebuilds the runtime from image + disk + startup logic — it is a cold start, not a memory restore.
