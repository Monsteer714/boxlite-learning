---
name: L1 image cache state and DockerHub auth requirement
description: Which boxlite L1 images are cached locally; Docker Hub credentials are required to pull missing images; Docker Desktop is not installed on this machine
type: project
---

As of 2026-08-11, the boxlite L1 image store at `~/.bl/c980f135/h/` has these images cached (complete=1):
- `docker.io/library/registry:2`
- `docker.io/library/redis:7-alpine`
- `docker.io/minio/minio:latest`
- `docker.io/jaegertracing/all-in-one:1.67.0`
- `docker.io/library/debian:bookworm-slim`

Missing (cause `failed` L1 boxes on `make up`):
- `postgres:17-alpine` — critical: API cannot start without it
- `dexidp/dex:v2.42.0` — critical: OIDC auth broken without it
- `dpage/pgadmin4:9.2.0`, `joxit/docker-registry-ui:main`, `otel/opentelemetry-collector:latest`, `caddy:2-alpine`, `minio/mc:latest`

**Why:** Docker Desktop is NOT installed on this machine. The infra-local compose layer uses the boxlite SDK (not Docker) to run microVMs, but image pulls hit Docker Hub anonymously and hit the rate/auth limit. DockerHub credentials must be supplied via env vars.

**How to apply:** Before `make up`, export:
```
DOCKERHUB_USERNAME=<user>
DOCKERHUB_TOKEN=<token>
```
The orchestrator reads these via `_local_arm64.dockerhub_creds()` and passes them to the SDK image registry auth config. Generate tokens at https://hub.docker.com/settings/security.
