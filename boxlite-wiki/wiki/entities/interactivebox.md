# InteractiveBox

**Summary:** Specialty box type for interactive PTY shell sessions.

## Overview

`InteractiveBox` is a specialty box that provides an interactive shell session inside a Box, with PTY support and optional I/O forwarding.

## API Surface

```python
box = ...  # InteractiveBox via SDK factory

# Configuration
box.shell = "/bin/sh"  # default
box.tty = None         # auto-detect from sys.stdin.isatty()
# True  = force TTY with I/O forwarding
# False = no I/O forwarding

# Wait for shell exit
status = box.wait()
```

## TTY Auto-Detection

`tty=None` auto-detects from `sys.stdin.isatty()`:

- **Interactive terminal:** TTY enabled, I/O forwarded live
- **Non-interactive / pipe:** TTY disabled, no I/O forwarding

## Relationship to PTY Support

This is the product-level interface to [[concepts/pty-support|PTY Support]] — the interactive pseudo-terminal sessions with resize and streaming I/O.

---

## Related

- **Entity:** [[entities/box|Box]]
- **Concept:** [[concepts/pty-support|PTY Support]]
- **Concept:** [[concepts/specialty-box-types|Specialty Box Types]]
- **Source:** [[sources/python-sdk-api-reference|Python SDK API Reference]]
