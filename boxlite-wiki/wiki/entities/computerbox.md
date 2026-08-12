# ComputerBox

**Summary:** Specialty box type providing a full desktop environment — mouse, keyboard, display, and GUI — for computer-use agent workloads.

## Overview

`ComputerBox` is a specialty box that provides a complete desktop environment inside a hardware-isolated Box, enabling "computer-use" agent scenarios.

## API Surface

```python
box = ...  # ComputerBox via SDK factory

# Mouse control
box.mouse.move(x=100, y=100)
box.mouse.click("left")
box.mouse.double_click("left")
box.mouse.drag(start=(0,0), end=(100,100))
box.mouse.cursor_position()

# Keyboard control (xdotool key syntax)
box.keyboard.type("Hello, world!")
box.keyboard.key("Return")
box.keyboard.key("ctrl+c")
box.keyboard.key("alt+Tab")
box.keyboard.key("ctrl+a Delete")

# Display
box.display.wait_until_ready(timeout=60)
box.display.screenshot()  # → {"base64": "..."}
box.display.scroll(dy=-100)
box.display.get_screen_size()  # → (1024, 768)
```

## Defaults & Constants

| Constant | Value |
|---|---|
| `COMPUTERBOX_CPUS` | 2 |
| `COMPUTERBOX_MEMORY_MIB` | 2048 |
| `COMPUTERBOX_DISPLAY_WIDTH` | 1024 |
| `COMPUTERBOX_DISPLAY_HEIGHT` | 768 |
| `COMPUTERBOX_GUI_HTTP_PORT` | 3000 |
| `COMPUTERBOX_GUI_HTTPS_PORT` | 3001 |
| `DESKTOP_READY_TIMEOUT` | 60 |

## Keyboard Syntax

Uses **xdotool key syntax**: `Return`, `ctrl+c`, `alt+Tab`, `ctrl+a Delete`, etc.

## Use Cases

- Computer-use AI agents
- GUI automation / testing
- Desktop-environment sandboxing

---

## Related

- **Entity:** [[entities/box|Box]]
- **Concept:** [[concepts/specialty-box-types|Specialty Box Types]]
- **Source:** [[sources/python-sdk-api-reference|Python SDK API Reference]]
