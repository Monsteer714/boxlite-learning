---
type: entity
title: "LiteBox"
created: 2026-08-12
updated: 2026-08-12
tags: [boxlite, execution, runtime-handle]
related:
  - entities/box
  - entities/c-sdk
  - entities/boxlite-runtime
  - concepts/lazy-initialization
  - concepts/run-command-semantics
  - concepts/pty-support
sources: ["README-20260812-1786500247054.md", "architecture-2026-08-12.md"]
---

# LiteBox

LiteBox is the per-Box runtime handle providing execution capabilities with lazy initialization. In the C SDK its execution surface is bound as `CExecutionHandle` with the `boxlite_execute` / `boxlite_execution_*` function family ([[sources/README-20260812-1786500247054|C SDK API Reference]]).

## Execution Control Surface

| Function | Behavior |
|---|---|
| `boxlite_execute(box, &cmd, callback, user_data, &execution, &error)` | Start a command with optional streaming output; returns an execution handle |
| `boxlite_execution_write(execution, data, len, &error)` | Write to the command's stdin |
| `boxlite_execution_wait(execution, &exit_code, &error)` | Block until completion, fetch exit code |
| `boxlite_execution_kill(execution, &error)` | Kill the running command |
| `boxlite_execution_resize_tty(execution, rows, cols, &error)` | Resize the PTY for interactive sessions (see [[concepts/pty-support|PTY Support]]) |
| `boxlite_execution_free(execution)` | Free the execution handle |

## `BoxliteCommand` Descriptor

The command descriptor generalizes execution beyond `run`-style semantics:

```c
typedef struct BoxliteCommand {
    const char* command;        // Required
    const char* const* args;    // NULL or array
    int argc;                   // count of args (excludes command and NULL terminator)
    const char* const* env_pairs;  // [key0, value0, key1, value1, ...]
    int env_count;
    const char* workdir;
    const char* user;           // e.g. "nobody", "1000:1000"
    double timeout_secs;        // 0.0 = no timeout
    int tty;                    // 0 = no TTY, non-zero = TTY
} BoxliteCommand;
```

## Callback Contract

The streaming callback receives `(const char* text, int is_stderr, void* user_data)` where `is_stderr` distinguishes stdout (0) from stderr (1); `user_data` is passed through untouched. The callback is invoked on the thread that calls `boxlite_runtime_drain()` for async introspection, and in the execution path as output streams are produced.

## Notes

- `argc` counts only the entries in `args` after the command — the same convention as `boxlite_simple_run` and easy to misuse.
- The execution handle is the C analog of LiteBox's per-box runtime capabilities, complementing the [[concepts/run-command-semantics|run-command semantics]] story where the command becomes PID 1.
