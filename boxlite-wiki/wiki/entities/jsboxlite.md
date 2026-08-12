---
type: entity
title: "JsBoxlite (Node SDK Runtime)"
created: 2026-08-12
updated: 2026-08-12
tags: [boxlite, node-sdk, typescript, runtime]
related:
  - entities/boxlite-runtime
  - entities/jsbox
  - entities/simplebox
  - concepts/daemonless-embedding
sources: ["README-20260812-1786500247068.md"]
---

# JsBoxlite (Node SDK Runtime)

The main runtime class of the BoxLite Node.js/TypeScript SDK — the Node/TS binding of [[entities/boxlite-runtime|BoxLite Runtime]]. Also exported under the alias `Boxlite`.

```typescript
import { JsBoxlite } from 'boxlite';
```

## Constructor

```typescript
new JsBoxlite(options: JsOptions)
```

### `JsOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `homeDir` | `string` | `~/.boxlite` | Base directory for runtime data |
| `imageRegistries` | `JsImageRegistry[]` | `[]` | Registry transport, TLS, search, auth config |

## Static Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `withDefaultConfig()` | `() => JsBoxlite` | Runtime with default config (`~/.boxlite`) |
| `initDefault()` | `(options: JsOptions) => void` | Initialize default runtime with custom options |

## Instance Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `create()` | `(options: JsBoxOptions, name?: string) => Promise<JsBox>` | Create a new box |
| `listInfo()` | `() => Promise<JsBoxInfo[]>` | List all boxes |
| `getInfo()` | `(idOrName: string) => Promise<JsBoxInfo \| null>` | Get box info |
| `get()` | `(idOrName: string) => Promise<JsBox \| null>` | Get box handle |
| `metrics()` | `() => Promise<JsRuntimeMetrics>` | Runtime-wide metrics |
| `remove()` | `(idOrName: string, force?: boolean) => Promise<void>` | Remove a box |
| `close()` | `() => void` | Close runtime (no-op) |

## Create Options (`JsBoxOptions`) — Highlights

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `image` | `string` | - | OCI image URI (or `rootfsPath` as alternative) |
| `cpus` | `number` | `1` | CPU cores |
| `memoryMib` | `number` | `512` | Memory limit |
| `diskSizeGb` | `number` | - | Persistent disk size |
| `workingDir` | `string` | `"/root"` | Working directory inside container |
| `network` | `NetworkSpec` | `{ mode: "enabled" }` | Structured network config |
| `ports` | `JsPortSpec[]` | `[]` | Local TCP port mappings |
| `secrets` | `Secret[]` | `[]` | Outbound HTTP(S) secret substitution rules |
| `advanced` | `AdvancedBoxOptions` | `{}` | Expert-only options (incl. `capabilities.add`/`drop`) |
| `autoRemove` | `boolean` | `false` | Auto cleanup when stopped |
| `detach` | `boolean` | `false` | Survive parent process exit |

## Notes

- `close()` is currently a no-op — [[concepts/daemonless-embedding|daemonless embedding]] is inherent to the library design.
- `autoRemove` defaults **false** at this low level (vs. `true` for [[entities/simplebox|SimpleBox]]) — the wrapper cleans up after itself; the low-level API leaves responsibility to the caller.
- Capability policy is deliberately nested under `advanced` with stated rationale: capabilities are "expert-only options".
