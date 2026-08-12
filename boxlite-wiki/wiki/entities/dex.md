---
type: entity
title: Dex (Local OIDC Identity Provider)
created: 2026-08-12
updated: 2026-08-12
tags: [authentication, oidc, identity-provider, docker, local-development]
related:
  - entities/dashboard
  - concepts/auth-follows-api
  - concepts/two-e2e-systems
  - sources/CLAUDE-20260812-1786500247209
sources: ["CLAUDE-20260812-1786500247209.md"]
---

# Dex (Local OIDC Identity Provider)

[Dex](https://dexidp.io/) is a CNCF OIDC identity provider used in the BoxLite repository to simulate a real identity provider for local development. It is the first auth-related entity in this wiki.

## Role in the Repository

- Started by `npm run dev:dex` and `npm run e2e:local`, alongside Docker Postgres (`boxlite-local-postgres`) and Redis (`boxlite-local-redis`); Dex itself runs as `boxlite-local-dex`.
- The apps workspace is launched with OIDC pointed at Dex, so local login exercises a realistic OIDC redirect flow without touching any real identity provider.
- Test account: `admin@boxlite.dev` / `password`.
- Browser E2E should log in through Dex when redirected and **must not** depend on cached cookies.

## Requirements

- `dev:dex` and `e2e:local` require Docker Desktop. The Postgres/Redis/Dex containers are created or reused automatically.

## Connection to Auth-Follows-API

Dex is the concrete local implementation of [[concepts/auth-follows-api|Auth Follows API]]: in any non-mock mode, the [[entities/dashboard|dashboard]]'s login flow uses whatever OIDC issuer the selected API reports via `/api/config` — and locally that issuer is Dex. In `start:mock` mode there is no backend and no login at all (MSW mocks stand in).
