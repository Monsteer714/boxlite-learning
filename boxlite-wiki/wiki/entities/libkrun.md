# libkrun

**Summary:** The current production VMM (Virtual Machine Monitor) implementation in BoxLite, using the libkrun hypervisor.

## Overview

`libkrun` is the production `Vmm` implementation used by BoxLite. It provides hardware virtualization on macOS (Hypervisor.framework) and Linux (KVM) and exposes virtio-based device emulation to the guest.

**Source:** `boxlite/src/vmm/`

## Features

- Hardware virtualization (macOS Hypervisor.framework, Linux KVM)
- virtio-fs for filesystem sharing
- virtio-blk for disk images
- vsock for host-guest communication
- Process takeover model (`krun_start_enter`)

## Configuration Flow

1. Create libkrun context
2. Set Box resources (CPUs, memory)
3. Configure network (TSI or gvproxy)
4. Mount virtiofs shares
5. Attach disk images
6. Configure vsock ports
7. Set guest entrypoint
8. Return `VmmInstance`

## Lifecycle Note

`VmmInstance::enter()` transfers control to the Box and **may never return** — this is why the shim runs as a subprocess (see [[concepts/subprocess-isolation|Subprocess Isolation]]).

---

## Related

- **Entity:** [[entities/shim-controller|Shim Controller]]
- **Concept:** [[concepts/pluggable-vmm|Pluggable VMM Architecture]]
- **Concept:** [[concepts/subprocess-isolation|Subprocess Isolation]]
