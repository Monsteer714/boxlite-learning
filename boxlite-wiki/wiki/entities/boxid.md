---
type: entity
title: "BoxID & ContainerID"
created: 2026-08-12
updated: 2026-08-12
tags: [rust-sdk, identifiers, base62, ulid, hex, migration]
related:
  - concepts/box-lifecycle
  - entities/boxlite-error
  - entities/box-options
sources: ["README-20260812-1786500247042.md"]
---

# BoxID & ContainerID

Identifier types in the Rust SDK.

## BoxID

- **Format:** 12-character Base62 (~71 bits of entropy); `short()` returns 8 characters for display.
- **Minting:** `BoxIDMint::mint()`.
- **Validation:** `BoxID::parse` accepts the 12-char Base62 format **and** the 26-char legacy ULID format.

### ⚠ Format Migration in Progress

`BoxInfo.id`'s doc comment still says "Unique box identifier (ULID)" while the concrete type has moved to Base62 with legacy-ULID acceptance. Treat the *transition* as the stable fact: new IDs are Base62, parsers accept both, and the docs lag behind the implementation.

## ContainerID

64-character lowercase hex in OCI format (`is_valid` check); `short()` returns 12 hex chars. Used for the guest container (see [[entities/guest-agent|Guest Agent]]).

## LockId

`BoxState.lock_id: Option<LockId>` is a **multiprocess-safe locking** mechanism for state transitions — a different mechanism from the in-process single-`RwLock` runtime state in [[concepts/single-rwlock-state|Single-RwLock State]]. The two should not be conflated.
