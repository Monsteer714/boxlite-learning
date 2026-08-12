---
type: entity
title: "Jailer"
created: 2026-08-12
updated: 2026-08-12
tags: [security, sandbox, os-level, jailer, seccomp, seatbelt]
related:
  - entities/box
  - entities/shim-controller
  - entities/macos-seatbelt
  - entities/libkrun
  - concepts/sandboxing-layers
  - concepts/sandbox-profile-language
  - concepts/macos-sandbox-denial-debugging
  - concepts/compile-time-policy-embedding
  - comparisons/seccomp-vs-seatbelt
  - sources/macos-sandbox-debugging-20260812-1786500247146
sources: ["key-takeaways-2026-08-12.md", "architecture-2026-08-12.md", "macos-sandbox-debugging-20260812-1786500247146.md"]
---

# Jailer

## Overview

OS-level sandboxing component guarding the [[entities/shim-controller|shim]] process — the second layer of BoxLite's [[concepts/sandboxing-layers|defense-in-depth]], sitting between the hardware-virtualized micro-VM ([[entities/libkrun|libkrun]]) and the workload inside. The Jailer is platform-split:

- **Linux** — seccomp-based sandboxing.
- **macOS** — Seatbelt sandboxing via `sandbox-exec`, using SBPL policies.

## macOS Implementation (Seatbelt)

The macOS sandbox isolates `boxlite-shim` with a deny-by-default SBPL policy. Implementation lives in `boxlite/src/jailer/sandbox/seatbelt.rs`:

- Static policy fragments in `boxlite/resources/seatbelt/*.sbpl`: base (process ops, sysctls, mach services, IOKit), file-read, file-write, and network (optional).
- `build_sandbox_policy()` assembles the runtime policy by joining static fragments with dynamic path grants from `build_dynamic_read_paths()` / `build_dynamic_write_paths()` (binary, volumes, `box_dir`).
- The assembled policy is passed directly to `sandbox-exec -p`.

Key gotchas: `.sbpl` files are embedded at compile time via `include_str!` (see [[concepts/compile-time-policy-embedding]]), and rules must use canonical paths (see [[concepts/macos-path-canonicalization]]).

## Debugging

Denials appear in the macOS unified log as `Sandbox: boxlite-shim(PID) deny(1) OPERATION TARGET`. The full workflow is documented in [[concepts/macos-sandbox-denial-debugging]].

## Related

- [[entities/shim-controller|Shim Controller]] — the sandboxed `boxlite-shim` process
- [[entities/macos-seatbelt|Seatbelt (macOS Sandbox)]]
- [[comparisons/seccomp-vs-seatbelt|seccomp vs Seatbelt]]
- [[concepts/sandboxing-layers|Sandboxing Layers]]
