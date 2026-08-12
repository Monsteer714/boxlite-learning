---
type: entity
title: "BoxCommand"
created: 2026-08-12
updated: 2026-08-12
tags: [rust-sdk, command, builder, execution]
related:
  - entities/execution
  - entities/litebox
  - concepts/run-command-semantics
  - concepts/pty-support
sources: ["README-20260812-1786500247042.md"]
---

# BoxCommand

Command builder for running programs inside a box. Consumed by `LiteBox::run(BoxCommand)`, which returns an [[entities/execution|Execution]] handle.

## Builder Methods

| Method | Description |
|--------|-------------|
| `new(command)` | Create the command |
| `arg(arg)` | Add a single argument |
| `args(I)` | Add multiple arguments |
| `env(key, val)` | Set an environment variable |
| `timeout(Duration)` | Set run timeout |
| `working_dir(dir)` | Set working directory |
| `user(user)` | Set execution user, e.g. `"nobody"` or `"1000:1000"` |
| `tty(bool)` | Enable a pseudo-terminal |

## Example

```rust
let cmd = BoxCommand::new("python3")
    .args(["-c", "print('hello')"])
    .env("PYTHONPATH", "/app")
    .timeout(Duration::from_secs(30))
    .working_dir("/workspace")
    .user("nobody")
    .tty(true);
```

## Relationship to Run-Command Semantics

`BoxCommand` is **exec-style** (command + args + env + timeout) and is orthogonal to but compatible with [[concepts/run-command-semantics|docker-parity `run IMAGE [COMMAND...]` semantics]]: the image's entrypoint/cmd spin up PID 1 at the container layer, and `BoxCommand` supplies the program and its runtime parameters on top.
