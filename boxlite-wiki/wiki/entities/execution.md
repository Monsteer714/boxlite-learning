---
type: entity
title: "Execution (Run Handle)"
created: 2026-08-12
updated: 2026-08-12
tags: [rust-sdk, execution, streaming, pty, async]
related:
  - entities/boxcommand
  - entities/litebox
  - concepts/box-lifecycle
  - concepts/pty-support
  - concepts/run-command-semantics
  - queries/exit-code-convention
  - entities/boxlite-error
sources: ["README-20260812-1786500247042.md"]
---

# Execution (Run Handle)

`Execution` is the handle to a running command inside a [[entities/litebox|LiteBox]], returned by `LiteBox::run(BoxCommand)`. It is the programmatic counterpart to the docker-style run flow: build a [[entities/boxcommand|BoxCommand]], execute it, stream its output, and wait for the result.

## Method Surface

| Method | Signature | Description |
|--------|-----------|-------------|
| `id` | `fn id(&self) -> &ExecutionId` | Run ID |
| `stdin` | `fn stdin(&mut self) -> Option<ExecStdin>` | Take stdin stream (once) |
| `stdout` | `fn stdout(&mut self) -> Option<ExecStdout>` | Take stdout stream (once) |
| `stderr` | `fn stderr(&mut self) -> Option<ExecStderr>` | Take stderr stream (once) |
| `wait` | `async fn wait(&mut self) -> BoxliteResult<ExecResult>` | Wait for completion |
| `kill` | `async fn kill(&mut self) -> BoxliteResult<()>` | Send SIGKILL |
| `signal` | `async fn signal(&self, signal: i32) -> BoxliteResult<()>` | Send arbitrary signal |
| `resize_tty` | `async fn resize_tty(&self, rows: u32, cols: u32) -> BoxliteResult<()>` | Resize PTY |

## Streams

- **`ExecStdout` / `ExecStderr`** implement `futures::Stream<Item = String>` — line-streamed output, readable with `StreamExt::next()`.
- **`ExecStdin`** is write-only: `write(&[u8])` and `write_all(&[u8])`. Dropping the stdin handle signals EOF to the process.
- Streams are **take-once**: `stdout()` returns `None` on a second call.
- Concurrent stdout/stderr consumption uses `tokio::select!`:

```rust
let mut stdout = run_handle.stdout().unwrap();
let mut stderr = run_handle.stderr().unwrap();
loop {
    select! {
        Some(line) = stdout.next() => println!("stdout: {}", line),
        Some(line) = stderr.next() => eprintln!("stderr: {}", line),
        else => break,
    }
}
```

## ExecResult

`ExecResult { exit_code: i32 }` with `success()` (exit code 0) and `code()`.

> **⚠ Exit-code convention conflict:** this reference documents `exit_code` as *negative = signal number* (e.g., SIGKILL = −9), which conflicts with the POSIX-style `128+n` convention recorded in [[concepts/exit-record|Exit Record]]. The discrepancy is tracked in [[queries/exit-code-convention|Exit-Code Convention]].

## Thread-Safety Caveat

The reference states `Execution` is `Clone` + shareable. In practice `stdin()`/`stdout()`/`stderr()`/`wait()` take `&mut self` and streams are single-use — so `Clone` yields *separate sequential* handles, not concurrent access to the same stream. "Shareable" means `Send + Sync`, not concurrent-use-safe.

## Relationships

- Built by `run` on [[entities/litebox|LiteBox]] from a [[entities/boxcommand|BoxCommand]].
- `resize_tty` + `BoxCommand::tty(true)` realize [[concepts/pty-support|PTY Support]].
- Orthogonal to [[concepts/run-command-semantics|docker-parity run semantics]]: the image's entrypoint/cmd becomes PID 1; `BoxCommand` adds exec-style parameters on top.
- Errors surface as [[entities/boxlite-error|BoxliteError]] variants (`Run`, `Rpc`, …).
