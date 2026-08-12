---
type: source
title: "Source: image-registry-configuration-20260812-1786500247154.md"
created: 2026-08-12
updated: 2026-08-12
sources: ["image-registry-configuration-20260812-1786500247154.md"]
tags: []
related: []
---

# Source: image-registry-configuration-20260812-1786500247154.md

# Source Analysis: Image Registry Configuration Guide

**Document type:** Technical guide (user-facing configuration reference)
**Language:** English
**Function in the wiki narrative:** Extends the "run-command semantics / image resolution" arc into the registry-configuration layer — how an unqualified image reference like `alpine` gets resolved before a box is created.

---

## Key Entities

| Entity | Type | Role | Already in wiki? |
|---|---|---|---|
| **Docker Hub (`docker.io`)** | External registry service | Central — implicit default when no registries are configured; always present at the bottom of the search chain | No — implicitly assumed by `oci-image` docs but never named as an entity |
| **BoxLite CLI (`boxlite`)** | Tool | Central — exposes `--config` and repeatable `--registry` flags with docker-like precedence layering | Yes — [[entities/boxlite-cli\|BoxLite CLI]] |
| **BoxLite SDKs (Python / Node.js)** | Tooling | Central — expose structured `image_registries` / `imageRegistries` options; "pure" by design (no auto config loading) | Partially — [[entities/boxlite-runtime\|BoxLite Runtime]] and [[entities/simplebox\|SimpleBox]] exist but lack registry-config details |
| **`boxlite.Options` / `JsBoxlite` constructor options** | SDK API object | Central — the programmatic carrier of registry configuration | No |
| **`ImageRegistry` / `ImageRegistry` struct** | SDK data type | Central — fields: `host`, `transport`, `skip_verify`, `search`, `auth` (basic/bearer) | No |
| **ghcr.io, quay.io** | Third-party registries | Peripheral — illustrative examples of public custom registries | No |
| **registry.local:5000, registry.example.com** | Example registries | Peripheral — demonstrate HTTP transport, TLS-skip, and auth cases | No |

---

## Key Concepts

| Concept | Definition | Significance | Already in wiki? |
|---|---|---|---|
| **Unqualified image resolution** | Turning `alpine` into `docker.io/library/alpine:latest` by trying each configured registry in order; first successful pull wins | This is the core mechanism the whole guide documents | No — [[concepts/oci-image\|OCI Image]] covers format, not resolution |
| **Registry search chain ordering** | Registries tried in list order; failure of all returns an error | Deterministic fallback behavior; the "first success wins" rule | No |
| **Fully-qualified reference bypass** | References containing a host (`quay.io/prometheus/prometheus:v2.40.1`) skip the search mechanism entirely | Important edge case — user intent overrides fallback | No |
| **Config source layering (CLI)** | Priority: default `docker.io` < config file < CLI `--registry` flags (prepended) | CLI flags *prepend* rather than override, forcing a checked-first order for a single command | No |
| **SDK purity / determinism** | SDKs never auto-load config files; behavior cannot silently depend on the user's environment | Deliberate design contrast with the CLI; requires explicit programmatic passing | No — extends [[concepts/d
