# CodeBox

**Summary:** Specialty box type for Python code execution + package management; the primary interface for running untrusted AI-generated code.

## Overview

`CodeBox` is a high-level specialty box that makes it trivial to execute Python code and manage packages inside a hardware-isolated Box.

**Default image:** `"python:slim"`

## API Surface

```python
box = client.create(BoxOptions(image="python:slim", ...))  # or via specialty factory

# Execute Python code
result = box.run("print('hello')")

# Execute a Python script
box.run_script("/path/to/script.py")

# Package management
box.install_package("requests")
box.install_packages(["numpy", "pandas"])
```

## Use Cases

- Executing untrusted AI-generated Python code safely
- Quick data analysis / scripting sandbox
- Package installation testing
- Agent tool execution

## Integration With Agent Frameworks

The how-to guides recommend CodeBox as the primary interface for AI-agent integration:

- Hardware isolation (not just container namespaces)
- Streaming output + kill on error
- Timeout handling via `asyncio.wait_for` + `execution.kill()`
- Performance: reuse boxes, batch operations, pre-pull images

---

## Related

- **Entity:** [[entities/box|Box]]
- **Concept:** [[concepts/specialty-box-types|Specialty Box Types]]
- **Source:** [[sources/python-sdk-api-reference|Python SDK API Reference]]
