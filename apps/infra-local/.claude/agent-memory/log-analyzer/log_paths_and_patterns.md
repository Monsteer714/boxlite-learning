---
name: Log File Paths and Diagnostic Patterns
description: Canonical log file locations for the boxlite local dev stack and key error signatures by failure type
type: reference
---

## Log File Locations

All active log files for the local dev stack live under:
`/Users/monsteer/Desktop/codes/boxlite-learning/.apps-local/logs/`

| File | Layer | Notes |
|---|---|---|
| `api.log` | NestJS API server | Webpack build output + NestJS structured logs; captures DB/Redis connection errors |
| `runner.log` | Go microVM runner | Structured zerolog JSON; captures API connectivity, OTel export, box sync errors |
| `proxy.log` | Go proxy | Captures API URL and OIDC connectivity at startup |
| `dashboard.log` | Vite/Node frontend | Captures Vite startup warnings and exit codes |

## Port Map (local dev stack)

| Port | Service | Notes |
|---|---|---|
| 3001 | API (NestJS) | L2 native process |
| 3003 | Runner | L2 native Go binary |
| 4000 | Proxy | L2 native Go binary |
| 3000 | Dashboard | L2 Vite dev server |
| 25432 | Postgres | L1 boxlite microVM box (NOT Docker) |
| 26379 | Redis | L1 boxlite microVM box (NOT Docker) |
| 25556 | Dex (OIDC) | L1 boxlite microVM box (NOT Docker) |
| 24318 | OTel HTTP | L1 boxlite microVM box (NOT Docker) |
| 24317 | OTel gRPC | L1 boxlite microVM box (NOT Docker) |
| 28080 | Caddy proxy | L1 boxlite microVM box (NOT Docker) |
| 29000 | MinIO | L1 boxlite microVM box (NOT Docker) |
| 25000 | Registry | L1 boxlite microVM box (NOT Docker) |
| 26686 | Jaeger UI | L1 boxlite microVM box (NOT Docker) |

## Key Error Signatures

### L1 boxes not running (most common root cause)
- `api.log`: `Error: connect ECONNREFUSED 127.0.0.1:25432` (Postgres) + `ECONNREFUSED 127.0.0.1:26379` (Redis)
- `proxy.log`: `WARN Operation failed, retrying operation="get BoxLite API config"... connection refused`
- `runner.log`: `ERR Failed to poll jobs ... connection refused` (all errors at once — the entire stack is cascade-down)

### OTel collector not running
- `runner.log`: `ERR OpenTelemetry error error="traces export: Post "http://127.0.0.1:24318/v1/traces": ... connection refused`
- `api.log` (stderr): `{"message":"connect ECONNREFUSED 127.0.0.1:24318"...}`

### API not up when runner/proxy start
- `runner.log`: `ERR Failed to poll jobs ... [::1]:3001: connect: connection refused`
- `proxy.log`: `WARN Operation failed, retrying operation="get BoxLite API config"... connection refused`

## L1 Architecture: BoxLite microVMs, NOT Docker

**Critical**: L1 services (Postgres, Redis, Dex, OTel, etc.) run as BoxLite microVM boxes, managed by the Python SDK
(`orchestrator.py` → `Boxlite.default().create()`). They do NOT use Docker/Docker Desktop as the container engine.

Docker Desktop is only used as an OPTIONAL credential source (`docker-credential-desktop`) for registry auth.
Its absence (no binary, no socket) is silently handled in `_local_arm64.py:_credstore_get()` via try/except.
**Docker Desktop being absent does NOT cause L1 to fail.**

The bring-up sequence is:
1. `boxlite serve` daemon must be running (provides the BoxLite runtime the SDK connects to)
2. `make up` (from `apps/infra-local/`) triggers `compose up` → `orchestrator.up()` → SDK creates L1 microVM boxes
3. Only then do the L1 ports (25432, 26379, etc.) become bound

## Diagnosis Approach for "stack not working"

1. Read `api.log` last 100 lines — look for `ECONNREFUSED 127.0.0.1:25432` (Postgres not up) or `ECONNREFUSED 127.0.0.1:26379` (Redis not up).
2. If found, L1 boxes are not running. Check: (a) is `boxlite serve` daemon running? (b) was `make up` run?
3. Run `make up` from `apps/infra-local/` to bring L1 boxes up via the BoxLite SDK.
4. Check `runner.log` for `ERR Failed to poll jobs` — this persists as long as the API isn't answering on port 3001.
5. `dashboard.log` `Warning: Invalid input options` lines are Vite deprecation warnings (non-fatal).
6. `dashboard.log` `Warning: command "vite" exited with non-zero status code` means the dashboard crashed — check for JSX config conflicts.
7. `make status` is the authoritative L1+L2 health command.

## Common Misdiagnosis: Docker not found

When Docker is absent AND L1 ports are unreachable, the root cause is almost always (D): BoxLite runtime/L1 boxes not started.
Docker absence only blocks registry auth fallback; it does not prevent L1 from running.
