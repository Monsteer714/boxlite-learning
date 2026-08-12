---
type: entity
title: "Cloudflare (Domain / API Token)"
created: 2026-08-12
updated: 2026-08-12
tags: [cloudflare, dns, credentials, control-plane]
related: ["[[entities/boxlite-control-plane]]", "[[entities/auth0-oidc-idps]]", "[[concepts/two-control-plane-secrets]]", "[[sources/README-20260812-1786500247224]]"]
sources: ["README-20260812-1786500247224.md"]
---

# Cloudflare (Domain / API Token)

Cloudflare serves `STACK_DOMAIN` (DNS/zone) for the [[entities/boxlite-control-plane|BoxLite Control Plane]]. Its API token is **the one credential a browser login cannot provide** — Cloudflare only issues a first API token through the dashboard, and offers **no machine-to-machine OAuth grant** for third-party clients. The `cf` CLI can mint a DNS-capable OAuth token, but it expires in ~1 hour with single-use refresh tokens — unusable as a stored CI secret. cert-manager, external-dns, and SST's own Cloudflare guide all require the same manual token.

## Token requirements

- Scope: `Zone:Read` + `DNS:Edit` on the zone serving `STACK_DOMAIN` (account-level token form; account-owned tokens survive the creator leaving the org).
- Creating one needs Administrator or Super Administrator.
- Stored in AWS SSM SecureString, *or* GitHub Environment secrets (**which win**).
- Prompted once per stage by `npm run bootstrap`; part of [[concepts/two-control-plane-secrets|Two-Control-Plane Secrets]].
