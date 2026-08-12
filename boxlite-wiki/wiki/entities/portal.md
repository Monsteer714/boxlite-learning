# Portal

**Summary:** gRPC-based host–guest communication layer connecting the host runtime to the in-guest Guest Agent.

## Overview

The Portal is the host-side communication layer that establishes and manages gRPC channels between the host application and the Guest Agent running inside the Box.

## Components

- **`GuestSession`** — High-level facade for the guest's service interfaces
- **`Connection`** — Lazy gRPC channel management
- **Service interfaces** — `GuestInterface`, `ContainerInterface`, `ExecutionInterface`

## Transport

Host application ↔ Unix socket ↔ libkrun vsock bridge ↔ vsock port 2695 ↔ Guest Agent (gRPC server)

See [[concepts/grpc-vsock-protocol|gRPC over vsock (Portal protocol)]] for the full protocol detail.

---

## Related

- **Entity:** [[entities/guest-agent|Guest Agent]]
- **Entity:** [[entities/boxlite-shared|boxlite-shared]]
- **Concept:** [[concepts/grpc-vsock-protocol|gRPC over vsock (Portal protocol)]]
