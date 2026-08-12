---
type: query
title: "Clarify create/exec semantics vs run-command semantics"
created: 2026-08-12
tags: []
related: []
---

# Clarify create/exec semantics vs run-command semantics

The quickstart calls `runtime.create(options, None)` then `litebox.exec(...)` without ever "running" the box. Does `create` start the container, or merely materialize it? What does the `None` second argument control? This is not self-evident given the wiki's emphasis on run-command semantics where the main command becomes PID 1. Worth documenting explicitly on the LiteBox page and/or run-command-semantics page, and possibly adding a query page.
