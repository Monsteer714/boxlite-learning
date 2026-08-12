# SecurityOptions

**Summary:** Configuration object for BoxLite security hardening; provides a master enabled/disabled switch, builder-level fields, and `development()` / `standard()` / `maximum()` presets.

## Overview

`SecurityOptions` is the security configuration surface exposed by the BoxLite SDK (crate `boxlite`). It lets callers choose between a compatibility-first default and progressively stricter isolation, culminating in resource-limited execution of untrusted AI-generated code.

**Source:** `boxlite::SecurityOptions` in the Rust API reference; also documented in the [[sources/ai-agent-integration-20260812-1786500247170|AI Agent Integration Guide]].

## Master Switch

```rust
SecurityOptions::enabled()   // maximum available isolation
SecurityOptions::disabled()  // compatibility-first default
```

Most users do not need to configure security — defaults prioritize compatibility. `SecurityOptions::enabled()` is the opt-in for advanced users who need maximum isolation.

## Builder Methods

| Method | Effect |
|---|---|
| `jailer_enabled()` | Enables/disables the [[entities/jailer\|Jailer]] OS-level sandbox |
| `network_enabled()` | Enables/disables guest networking (macOS-only restriction per platform support) |
| `max_open_files()` | Caps open file descriptors in the guest |
| `max_file_size()` | Caps individual file size |
| `max_processes()` | Caps number of processes |
| `max_cpu_time()` | Caps CPU time consumed |

## Presets

| Preset | Use Case |
|---|---|
| `development()` | Local development and debugging; looser limits |
| `standard()` | Balanced default for production agent workloads |
| `maximum()` | Untrusted AI-generated code; adds `max_open_files`, `max_file_size`, `max_processes` |

## Integration with Security Model

`SecurityOptions` is the operational face of the [[concepts/two-state-security-model|Two-State Security Model]] and the defense-in-depth stack described in [[concepts/sandboxing-layers|Sandboxing Layers]]. The `maximum()` preset is specifically recommended for executing untrusted AI code.

## Usage Example

```rust
use boxlite::{AdvancedBoxOptions, SecurityOptions};

let opts = BoxOptions {
    advanced: AdvancedBoxOptions {
        security: SecurityOptions::enabled()
            .max_open_files(1024)
            .max_processes(64),
        ..Default::default()
    },
    ..Default::default()
};
```

---

## Related

- **Entity:** [[entities/jailer|Jailer]]
- **Entity:** [[entities/box|Box]]
- **Concept:** [[concepts/two-state-security-model|Two-State Security Model]]
- **Concept:** [[concepts/sandboxing-layers|Sandboxing Layers (Defense-in-Depth)]]
- **Source:** [[sources/ai-agent-integration-20260812-1786500247170|AI Agent Integration Guide]]
