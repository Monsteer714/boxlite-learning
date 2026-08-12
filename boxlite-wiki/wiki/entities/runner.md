---
type: entity
title: "Runner"
created: 2026-08-12
updated: 2026-08-12
tags: [runner, control-plane, execution, forwarding]
related:
  - sources/auto-stop-resume-20260812-1786500247161
  - entities/boxlite-control-plane
  - entities/box
  - concepts/auto-stop-resume-delete
sources: ["auto-stop-resume-20260812-1786500247161.md"]
---

# Runner

## Definition

The component that receives user operations **after** a box reaches `STARTED`. In the AutoResume flow, the control plane waits for the box to reach `STARTED` before forwarding the pending Exec/Files/WebSocket operation "to the runner."

## Role in AutoResume

1. User issues an operation against a stopped box.
2. The control plane submits or joins a Start operation.
3. The **first request waits** until the box actually reaches `STARTED`, then is forwarded to the runner.
4. If startup fails or times out, the request fails directly — it is never forwarded to a box that is not yet ready.

## Status: Under-verified

The runner is referenced by the AutoStop/AutoResume/AutoDelete specification but is **not defined in this wiki's source set**. It may be:
- a distinct control-plane component that dispatches operations to started boxes, or
- an alias for an existing component (e.g., the host-side execution path for [[entities/box|Box]] operations).

**This page is a placeholder pending confirmation** — see the duplicate review attached to this ingest.
