---
name: infra-local make targets and component architecture
description: Available make targets in apps/infra-local, L1/L2 distinction, ports, and runtime lock behavior
type: project
---

## Make targets (from `make help`)
- `make up` — ensure L1 boxes + start L2 (default: COMPONENTS="api runner")
- `make down` — stop L2 procs; `ARGS=--all` also stops L1 boxes
- `make status` — one-screen L1 + L2 health (exits 1 if anything degraded)
- `make logs COMPONENT=<name|all>` — tail a component log
- `make restart COMPONENTS="runner dex"` — restart specific L2 or L1
- `make reset [ARGS=--hard]` — wipe L2 runtime state; --hard also rebuilds schema
- `make nuke` — tear down EVERYTHING (L1 boxes + data + logs)

## L1 services (microVM boxes, run via boxlite SDK)
All defined in `compose/services.py`. Port mappings (host:container):
- postgres: 25432:5432
- redis: 26379:6379
- minio: 29000:9000, 29001:9001
- minio-init: one-shot
- registry: 25000:5000
- dex: 25556:5556
- jaeger: 26686:16686, 26687:4317
- pgadmin: 25051:80
- registry-ui: 25052:80
- otel-collector: 24317:4317, 24318:4318, 23133:13133
- caddy: 28080:80, 28443:443, 12019:2019

## L2 services (native processes on host)
- api: port 3001
- runner: port 3003
- proxy: port 4000 (note: status shows 4000, not 3002 as log-analyzer reported)
- dashboard: port 3000

## Runtime notes
- The boxlite runtime (`~/.bl/c980f135/h/`) holds a file lock — only one process can use it at a time. Running `make status` while `make up` is active will fail with "Another BoxliteRuntime is already using directory".
- The compose layer uses the boxlite Python SDK, NOT Docker. Docker is only referenced for DockerHub credential lookup via `docker-credential-desktop`.
- SQLite database at `~/.bl/c980f135/h/db/boxlite.db`, table `image_index` shows cached images by reference.
