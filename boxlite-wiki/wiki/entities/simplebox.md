# SimpleBox

**Summary:** High-level embedded API object wrapping Box creation in SDKs. Exposes docker-style run semantics via `BoxOptions.cmd/entrypoint`, `attach()`, `wait()`, and the `Boxlite.run()` convenience — without changing its original create-without-command behavior.

## Overview

`SimpleBox` is the high-level object exposed in language SDKs, wrapping the underlying `LiteBox` + `BoxliteRuntime` machinery so SDK users get a simple, ergonomic API.

## SDK Run-Command Surface

With the SDK run-command semantics design, `SimpleBox` gains docker-style capabilities while preserving backward compatibility:

### Options (thin parity)

- `BoxOptions.cmd: list[str] | None`
- `BoxOptions.entrypoint: list[str] | None`
- `user` / `working_dir` passthrough

### Box Methods

- `box.attach()` → main-command session (no-arg default; docker-py shape)
- `box.attach(execution_id)` → exec-session reattach (unchanged callers)
- `await box.wait() -> BoxResult(exit_code: int)` — docker-py `Container.wait()` shape but typed

### `Boxlite.run()` Convenience

```python
result = await rt.run("alpine", ["sh", "-c", "make test"])
# → RunResult(exit_code, stdout, stderr)
```

- `detach=True` returns the Box immediately
- `detach=False` (default) → create → start → attach_init → stream to completion → auto-remove → return `RunResult`
- stdout/stderr size cap default 8 MiB, configurable; unbounded via `detach=True` + `attach_init()`

### Deliberate Deviation from docker-py

Non-zero exit does **not** raise `ContainerError`. Exit codes are treated as **data** — agent frameworks (the primary market) branch on them without try/except.

## Python SDK Box Handle

```python
box.exec(cmd, args, env, tty) → Execution
box.stop()
box.remove()
box.info()
box.metrics()
box.network.tunnel(port) → BoxTunnel → connect() → BoxConnection
```

- **Each tunnel handle = exactly one connection** — call `tunnel()` again for each concurrent connection
- `published_ports` tri-state: `None` (handle doesn't know) / `[]` (no active) / populated (concrete bindings)

## Explicit Non-Changes

- `SimpleBox` created without `cmd` → image default init → boot-and-exec unchanged (byte-identical behavior)
- Existing `exec` / `attach(execution_id)` unchanged
- Go and C SDKs deferred until Python/Node shape survives review

## Sync API

`pip install boxlite[sync]` provides `SyncBoxlite`, `SyncBox`, `SyncSimpleBox`, `SyncCodeBox` via greenlet fiber switching. See [[concepts/sync-api-greenlets|Sync API via Greenlets]].

## Personas

| Persona | Description | Exit codes are... |
|---|---|---|
| **A — Sandbox (today's users)** | Boot once, exec many | Data (agent frameworks branch on them) |
| **B — Docker-style (unlocked by run-command semantics)** | Run one command to completion as the workload | The result |

---

## Related

- **Entity:** [[entities/litebox|LiteBox]]
- **Entity:** [[entities/boxlite-runtime|BoxLite Runtime]]
- **Comparison:** [[comparisons/litebox-vs-simplebox|LiteBox vs SimpleBox]]
- **Source:** [[sources/sdk-run-semantics-api|SDK Run-Command Semantics (API Design)]]
