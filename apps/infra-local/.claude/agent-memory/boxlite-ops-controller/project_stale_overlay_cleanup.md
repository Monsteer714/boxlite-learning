---
name: Stale overlay tmp directory cleanup pattern
description: Interrupted make up can leave a stale tmp overlay dir with mode-000 files that block the next make up with Permission denied on xattr read; make down clears it
type: project
---

When `make up` is interrupted mid-box-creation, the boxlite runtime can leave a stale overlay directory in `~/.bl/<runtime-id>/h/tmp/` (e.g. `.tmpoG7vM6/`). These directories contain a full Linux filesystem overlay (`merged/`), including files like `etc/shadow` with mode `----------` (000), which block xattr reads and cause the next `make up` to crash:

```
RuntimeError: storage error: Failed to read ownership xattr on
~/.bl/c980f135/h/tmp/.tmpoG7vM6/merged/etc/shadow: Permission denied (os error 13)
```

**Remediation:** `make down ARGS=--all` triggers box deregistration, which causes the runtime to clean up these tmp directories. After `make down`, verify `~/.bl/c980f135/h/tmp/` is empty before retrying `make up`.

**Why:** Related to `fix(disk): silent debugfs failures, xattr loss, image capacity (#1182)`. The runtime's ownership xattr read runs on overlay directories during box start and hits permission errors on the shadow file from the abandoned overlay.
