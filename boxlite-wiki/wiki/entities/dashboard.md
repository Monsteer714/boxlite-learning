---
type: entity
title: BoxLite Dashboard (apps/dashboard)
created: 2026-08-12
updated: 2026-08-12
tags: [dashboard, web-application, frontend, vite, control-plane, nx]
related:
  - entities/boxlite-control-plane
  - entities/dex
  - entities/e2e-pytest-suite
  - concepts/same-origin-api-proxy
  - concepts/auth-follows-api
  - concepts/two-e2e-systems
  - sources/CLAUDE-20260812-1786500247209
sources: ["CLAUDE-20260812-1786500247209.md"]
---

# BoxLite Dashboard (apps/dashboard)

The web application under `apps/dashboard/` — the human-facing client surface of the BoxLite platform, and the reason the entire command matrix in [[sources/CLAUDE-20260812-1786500247209|Local Dashboard And E2E Commands]] exists.

## Architecture

- **Same-origin API calls only** — the dashboard never makes a cross-origin request; it always calls `/api` on its own origin, and the Vite dev server proxies `/api` to whatever backend the launch command selected. See [[concepts/same-origin-api-proxy|Same-Origin API Proxy Pattern]].
- **Backend chosen per command** — the proxy target is read by `apps/dashboard/vite.config.mts` via `DASHBOARD_API_PROXY_TARGET`, sourced from the `API_TARGETS` map in `apps/scripts/start-dashboard.mjs`.
- **Auth follows the API** — login uses whatever OIDC issuer the selected API reports via `/api/config` (locally: [[entities/dex|Dex]]). See [[concepts/auth-follows-api|Auth Follows API]].

## Run Modes

| Mode | Command | Backend |
|---|---|---|
| Dev (default) | `npm run start` / `npm run start:dev` | Dev API |
| Local | `npm run start:local` | `http://localhost:3001` |
| Prod | `npm run start:prod` (requires `--yes-prod`) | Prod API — unconfigured until the prod stage exists |
| Arbitrary | `npm run start -- --api=<url>` | Any API URL (staging, PR previews) |
| Mock | `npm run start:mock` | MSW mocks — no backend, no login |
| Full local dev | `npm run dev:dex` | Local API + Dex OIDC (Postgres/Redis/Dex via Docker) |

All dashboard commands run from `apps/` (the Nx workspace root), not the repository root.

## Testing

- Browser E2E runs via `npm run e2e:local` — the sole E2E startup entrypoint; the dashboard UI is driven through a real OIDC login (Dex) with no cached-cookie dependency. See [[concepts/two-e2e-systems|Two E2E Systems]].
- The [[entities/e2e-pytest-suite|pytest stack suite]] validates the backend chain (SDK/CLI → API → runner → microVM) that the dashboard consumes.

## Open Questions

- **Relationship to the control plane** — is the dashboard the UI for the [[entities/boxlite-control-plane|BoxLite Control Plane]], or a separate product surface? The source documents the dashboard as a client of dev/local/prod API targets but never names the control plane explicitly. If it *is* the control-plane UI, the API targets likely map to control-plane deployments.
