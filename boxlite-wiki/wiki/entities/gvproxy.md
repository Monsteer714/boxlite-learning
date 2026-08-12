# gvproxy

**Summary:** Default user-mode network backend for BoxLite based on gVisor's network stack.

## Overview

`gvproxy` is the default `NetworkBackend` implementation. It provides user-mode networking for Boxes, handling NAT, DHCP, and DNS without requiring host network privileges.

## Features

- Full outbound internet access
- Local port publication (TCP)
- Local one-shot service tunnels
- Built-in DHCP and DNS
- Network metrics (bytes sent/received)

## Architecture

```
Box                    gvproxy                  Internet
┌──────┐              ┌───────┐              ┌──────────┐
│ eth0 │◄────vsock───▶│       │◄────TCP/UDP─▶│          │
└──────┘              │ NAT   │              │ External │
                      │ DHCP  │              │ Services │
                      │ DNS   │              └──────────┘
                      └───────┘
```

## Service Access Across Runtimes

The box network tunnel API is portable across local and REST runtimes, but its transport is backend-specific. Local tunnels return a prepared gvproxy connection; REST tunnels connect through the remote service proxy and also carry its public URI. Each SDK tunnel handle represents one connection. Explicit host port publication is a separate local-runtime feature that owns a TCP listener and accepts repeated connections.

## Alternative

[[comparisons/gvproxy-vs-libslirp|libslirp]] — QEMU's user-mode networking stack — is available for environments where gvproxy isn't available.

---

## Related

- **Entity:** [[entities/box|Box]]
- **Comparison:** [[comparisons/gvproxy-vs-libslirp|gvproxy vs libslirp]]
