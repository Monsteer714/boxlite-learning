---
type: synthesis
title: SimpleBox exec Call Chain — Boxlite.default() → BoxOptions → SimpleBox → exec()
tags: [sdk, exec, concurrency, timeout, reaper, lazy-init]
related:
  - entities/simplebox
  - entities/litebox
  - entities/execution
  - entities/boxcommand
  - entities/boxoptions
  - entities/portal
  - entities/guest-agent
  - concepts/lazy-initialization
  - concepts/single-rwlock-state
  - concepts/run-command-semantics
  - concepts/exit-record
  - concepts/config-gated-restart-refusal
  - concepts/fork-in-multithreaded-process-hazard
  - concepts/grpc-vsock-protocol
  - sources/run-command-semantics-fix
  - sources/concurrent-exec-deadlock
created: 2026-08-12
updated: 2026-08-12
---

# SimpleBox exec Call Chain

**Summary:** End-to-end walk-through of the canonical SDK usage pattern
`Boxlite.default() → BoxOptions → SimpleBox → exec()`. The skeleton is
**"construct lazily, execute forcibly"** — `SimpleBox(...)` and
`runtime.create()` only do bookkeeping; the VM boots on first `exec` (via
`live_state()`), and every hard guarantee (pre-gates, concurrency, timeout,
zombie prevention) is enforced in the Rust/guest layers, not the SDK.

Python is the reference surface here (`Boxlite.default()`); Node's
`JsBoxlite.withDefaultConfig()` is the analogue with identical semantics.

## Call Graph

```
Boxlite.default()                   PyO3 static · sdks/python/boxlite/simplebox.py
  → BoxOptions(image=...)            plain data; zero side effects
  → SimpleBox(image=...)             stores options only, does NOT create
      └─ async with / await start()  deferred-creation trigger (simplebox.py)
           └─ runtime.create()       Rust · runtime/rt_impl.rs
                └─ LiteBox handle     name-dedupe → lock → DB persist (Configured)
                                      → return handle; VM not started
      → box.exec(cmd, ...)           SDK → native → BoxImpl::exec (litebox/box_impl.rs)
           ├─ ① shutdown-token check handle invalidated by stop()?
           ├─ ② exec pre-gate        refuse implicit re-run of a user main command
           ├─ ③ live_state()         lazy boot: layout → rootfs → shim → VM → guest
           ├─ ④ ExecutionService     gRPC over vsock → guest libcontainer spawn
           │     ├─ concurrency      split lock domains; wait never blocks kill
           │     ├─ timeout          SIGTERM → 2s grace → SIGKILL (guest timeout.rs)
           │     └─ zombies          Reaper single waitpid(-1) + sticky ExitSlot
           └─ ⑤ SDK drains stdout+stderr concurrently (anti-pipe-deadlock)
```

## Per-Step Semantics

### Boxlite.default()

- Returns the process-global default runtime (`~/.boxlite`, single-instance file
  lock). Used when `SimpleBox` is constructed without an explicit `runtime=`.
- `SyncBoxlite.default()` (sync API) wraps the same native static.
- To customize the default (e.g. home dir), `init_default(Options(...))` must run
  before any `default()` call.

### BoxOptions

Pure parameter container: image/rootfs, CPUs/memory, network, security, ports,
`auto_remove`, `name`, `reuse_existing`. `name` + `reuse_existing` decide
create-vs-adopt an existing same-name box.

### SimpleBox construction — deferred creation

- Python: `__init__` stores options; creation happens in `__aenter__`/`start()`
  ("The box is not actually created until entering the async context manager").
- Node: `_ensureBox()` dedupes with a `_boxPromise` so two concurrent first
  `exec()` calls cannot create two boxes (race-safe lazy init).

### runtime.create() — bookkeeping, not boot

`create_inner` (rt_impl.rs): shutdown check → name lookup (`lookup_box`) →
allocate lock → persist to DB (status `Configured`) → `get_or_create_box_impl`
→ return `LiteBox`.

- **TOCTOU race**: `lookup` and `add_box` are non-atomic; under concurrent
  same-name creates the loser recovers by re-reading and **adopting** the winner
  when `reuse_existing` is set.
- **Real boot is lazy**: the first API call goes through `live_state()` →
  filesystem layout → boot assets + rootfs → shim subprocess (jailer sandbox) →
  VM → guest ready. See [[concepts/lazy-initialization|Lazy Initialization]].

### BoxImpl::exec — three pre-gates

`box_impl.rs`:

1. **Shutdown-token check** — a handle invalidated by `stop()` refuses with
   `Stopped`.
2. **Config-gated restart refusal** (`ensure_usable_without_rerunning_main`)
   — from [[concepts/run-command-semantics|run-command semantics]] §6:
   - A box created *without* `cmd` (SimpleBox's default) has init = image
     default daemon, stays Running, execs join it, and a Stopped box **may boot
     implicitly** on exec — the contract the cloud's auto-stop/auto-restart
     relies on (the data plane forwards `/exec` and never calls `start`).
   - A box with `cmd`/`entrypoint` has init = the user's own workload; once
     Stopped, exec is refused cleanly rather than re-running that workload.
3. **`live_state()`** lazy boot, then container-ID env injection + default
   working_dir, then `exec_interface.exec(command)` over gRPC (vsock) to the
   guest `ExecutionService`.

## Operating Semantics

### Concurrency model

- **Single-RwLock host state**: one `sync_state: RwLock<SynchronizedState>`
  guards all mutable runtime state; metrics are lock-free `AtomicU64`. See
  [[concepts/single-rwlock-state|Single-RwLock State]].
- **Split lock domains on `Execution`**: `inner: Arc<Mutex<ExecutionInner>>`
  owns `interface/stdin/stdout/stderr`; `WaitState` is an independent
  `OnceCell<ExecResult>` + `mpsc::UnboundedReceiver`. `wait()` parks only in the
  `wait_state` domain, so **a parked wait never blocks `kill()`/`signal()`/
  `resize_tty()`** (guarded by the `wait_does_not_block_kill` test).
- **SDK must drain stdout+stderr concurrently** (`asyncio.gather` /
  `Promise.all`): sequential reads deadlock when one pipe buffer fills while the
  SDK is blocked reading the other.
- **`wait()` is repeatable**: `OnceCell::get_or_try_init` caches the result;
  later waiters read the cache and no second RPC is issued.

### Timeout handling (the SDK never raises on timeout)

Guest-side `timeout.rs`, three stages:

1. At the deadline → **SIGTERM** (cooperative cleanup).
2. Grace period **2 s** (`TIMEOUT_GRACE`).
3. → **SIGKILL** (uncatchable hard stop).

SDK contract: no `TimeoutError`; returns `ExecResult` whose `exit_code` reflects
how the process died (negative = signal, e.g. `-9`). Historical bug: a catchable
SIGALRM could be absorbed via `SIG_IGN`, bypassing the deadline — now SIGKILL is
used (regression test asserts `exit_code != 0` *and* elapsed ≈ deadline).
`timeout_seconds` rejects negative/NaN/Infinity.

### Zombie-process prevention

- **Host-side Reaper** (shim owns the VM/child processes):
  - `Reaper::run` is the single `waitpid(-1)` loop driven by SIGCHLD.
  - Each spawn `register` returns an `ExitSlot` (`watch::channel(None)`);
    `deliver` fills it with `send_replace(Some(status))` — sticky and
    level-triggered, so a late or concurrent waiter reads the same value.
  - **PID-recycle attribution guards** (two timestamps): `settled_at` vs
    `spawned_at` — `register` drops a slot settled before spawn, `deliver`
    detaches an already-settled slot before depositing, so a recycled pid can
    never hand the previous owner's status to the new process.
  - `REAPED_TTL` ages out unclaimed strays.
- **Guest-side zygote**: zygote is the parent of both init and tenants and
  `do_wait`s them, so no zombies accumulate inside the guest either. See
  [[concepts/fork-in-multithreaded-process-hazard|Fork-in-Multithreaded-Process
  Hazard]].

## Key Invariants

1. SDK boxes (no `cmd`) are the **boot-once, exec-many** pod model; the
   cloud's auto-restart depends on implicit re-boot of a Stopped box.
2. Trust boundaries: host↔SDK is same-process FFI; host↔guest is gRPC over
   vsock ([[concepts/grpc-vsock-protocol|Portal protocol]]).
3. Exit status is sticky and re-readable (`ExitSlot`/`OnceCell`), so
   wait/kill/timeout never race the process's real exit.

## Related

- **Entities:** [[entities/simplebox|SimpleBox]], [[entities/litebox|LiteBox]],
  [[entities/execution|Execution]], [[entities/boxcommand|BoxCommand]],
  [[entities/boxoptions|BoxOptions]], [[entities/portal|Portal]],
  [[entities/guest-agent|Guest Agent]]
- **Concepts:** [[concepts/lazy-initialization|Lazy Initialization]],
  [[concepts/single-rwlock-state|Single-RwLock State]],
  [[concepts/run-command-semantics|Run-Command Semantics]],
  [[concepts/exit-record|Exit Record]],
  [[concepts/config-gated-restart-refusal|Config-Gated Restart Refusal]],
  [[concepts/grpc-vsock-protocol|gRPC over vsock]]
- **Sources:** [[sources/run-command-semantics-fix|Run-Command Semantics Fix]],
  [[sources/concurrent-exec-deadlock|Concurrent Exec Deadlock]]
