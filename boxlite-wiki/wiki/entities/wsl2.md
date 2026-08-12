---
type: entity
title: "WSL2 (Windows Subsystem for Linux 2)"
created: 2026-08-12
updated: 2026-08-12
tags: [boxlite, windows, wsl2, virtualization]
related:
  - entities/kvm
  - concepts/platform-support-matrix
  - concepts/boxlite-troubleshooting
  - entities/libkrun
  - sources/README-20260812-1786500247097
sources: ["README-20260812-1786500247097.md"]
---

# WSL2 (Windows Subsystem for Linux 2)

**WSL2** is Microsoft's second-generation Windows Subsystem for Linux — a lightweight VM-backed compatibility layer. It is BoxLite's **Windows support path**: Windows users run BoxLite inside WSL2 (x86_64) with KVM available inside the VM.

## Verification and Setup

- Confirm WSL2 (not WSL1): `wsl.exe -l -v` (version column must show `2`)
- Check KVM inside WSL: `ls -l /dev/kvm`
- Add the user to the `kvm` group, then either run `newgrp kvm` or restart WSL from Windows PowerShell: `wsl.exe --shutdown`
- Verify access: `python3 -c "open('/dev/kvm','rb').close(); print('kvm ok')"`

The KVM-based path means Windows support inherits all the Linux [[entities/kvm|KVM]] permission requirements (see [[concepts/platform-support-matrix|Platform Support Matrix]] and [[concepts/boxlite-troubleshooting|Installation & Runtime Troubleshooting]]). It is the Windows counterpart to the macOS [[entities/hypervisor-framework|Hypervisor.framework]] path — both exist to feed the [[entities/libkrun|libkrun]] VMM a hardware-virtualization backend.
