---
type: entity
title: "JsBox (Node Box Handle)"
created: 2026-08-12
updated: 2026-08-12
tags: [boxlite, node-sdk, box-handle]
related:
  - entities/litebox
  - entities/jsboxlite
  - concepts/network-tunnels
  - concepts/single-pass-stream-consumption
sources: ["README-20260812-1786500247068.md"]
---

# JsBox (Node Box Handle)

Handle to a running or stopped box in the Node.js SDK — the SDK-level counterpart of [[entities/litebox|LiteBox]]. Returned by `JsBoxlite.create()` and `JsBoxlite.get()`.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique box identifier (ULID) |
| `name` | `string \| null` | User-defined name |
| `network` | `JsNetworkHandle` | Box-scoped tunnel operations |

## Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `info()` | `() => Promise<JsBoxInfo>` | Box metadata |
| `exec()` | `(cmd, args?, env?, tty?) => Promise<JsExecution>` | Execute command |
| `stop()` | `() => Promise<void>` | Stop the box |
| `metrics()` | `() => Promise<JsBoxMetrics>` | Resource metrics |

## `JsBoxInfo`

Metadata incl. `id`, `name`, `state` (`status`, `running`, optional `pid`), `createdAt`, `image`, `cpus`, `memoryMib`, and `network` (`JsNetworkInfo \| null`). See [[concepts/port-publishing-semantics|Port Publishing Semantics]] for the `publishedPorts === null` vs. `[]` distinction.

## Notes

- `box.info()` always returns a promise; local metadata reads report bindings captured when the handle started or reattached the box, while REST metadata reads fetch the current server record.
- A newly loaded local running box has no live binding data yet, so `box`/`get`/`list` info may report `publishedPorts === null` until an operation requiring live state reattaches it.
- Exec streams are single-pass: see [[concepts/single-pass-stream-consumption|Single-Pass Stream Consumption]].
