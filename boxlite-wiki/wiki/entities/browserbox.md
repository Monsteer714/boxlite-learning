# BrowserBox

**Summary:** Specialty box type for browser automation via Chrome DevTools Protocol (CDP).

## Overview

`BrowserBox` is a specialty box that provides a full browser environment inside a hardware-isolated Box, exposing CDP endpoints for automation.

## API Surface

```python
box = ...  # BrowserBox via SDK factory

# Get CDP endpoint
endpoint = box.endpoint()
# → "http://localhost:9222"

# Connect with Puppeteer or Playwright
import asyncio
from playwright.async_api import async_playwright

async with async_playwright() as p:
    browser = await p.chromium.connect_over_cdp(endpoint)
```

## Browser Support

| Browser | CDP Port |
|---|---|
| chromium | 9222 |
| firefox | 9223 |
| webkit | 9224 |

## Use Cases

- Web scraping / automation
- AI-agent web interaction
- Screenshot / page capture
- Interactive web debugging

---

## Related

- **Entity:** [[entities/box|Box]]
- **Concept:** [[concepts/specialty-box-types|Specialty Box Types]]
- **Source:** [[sources/python-sdk-api-reference|Python SDK API Reference]]
