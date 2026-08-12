---
type: entity
title: "KVM (Kernel-based Virtual Machine)"
created: 2026-08-12
updated: 2026-08-12
tags: [boxlite, virtualization, linux, kvm, prerequisite]
related:
  - entities/libkrun
  - entities/wsl2
  - concepts/platform-support-matrix
  - concepts/sandboxing-layers
  - concepts/boxlite-troubleshooting
  - sources/README-20260812-1786500247097
sources: ["README-20260812-1786500247097.md"]
---

# KVM (Kernel-based Virtual Machine)

**KVM** (Kernel-based Virtual Machine) is the Linux kernel virtualization module that provides hardware-assisted virtualization. It is the prerequisite that makes BoxLite's [[concepts/micro-vm|micro-VM]] execution possible on Linux and Windows/WSL2: [[entities/libkrun|libkrun]] — BoxLite's production VMM — runs on top of KVM on those platforms.

## Requirements on Linux

- CPU must expose virtualization flags (`vmx` on Intel, `svm` on AMD): `grep -E 'vmx|svm' /proc/cpuinfo`
- `/dev/kvm` must exist and be accessible: `ls -l /dev/kvm`
- The module may need loading: `sudo modprobe kvm`, `sudo modprobe kvm_intel` / `sudo modprobe kvm_amd`
- The user must be in the `kvm` group: `sudo usermod -aG kvm $USER` — apply with `newgrp kvm` or a re-login (on WSL2: `wsl.exe --shutdown`)

## The 30-Second Guest-Ready Timeout

A "Timeout waiting for guest ready (30s)" error is **likely** a KVM permission issue — a hedged diagnosis in the source, not a certainty. KVM accessibility is therefore the first thing to check when a Box fails to boot. See [[concepts/boxlite-troubleshooting|Installation & Runtime Troubleshooting]] for the full diagnostic flow.

## Role in Defense-in-Depth

KVM is the hardware-isolation foundation of the [[concepts/sandboxing-layers|four-layer sandboxing model]] (KVM → jailer → cgroups/rlimits → environment sanitization). The same `/dev/kvm` device is what [[concepts/nested-virtualization-rc|Nested Virtualization (RC)]] passthrough would expose to OCI workloads.
