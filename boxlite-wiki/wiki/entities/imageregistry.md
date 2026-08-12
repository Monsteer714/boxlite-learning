---
type: entity
title: "ImageRegistry"
created: 2026-08-12
updated: 2026-08-12
tags: [oci, registry, auth, tls, boxlite]
related:
  - entities/boxlite-runtime
  - entities/boxlite-python-sdk
  - concepts/oci-image
  - concepts/oci-image-caching
sources: ["README-20260812-1786500247030.md"]
---

# ImageRegistry

Per-registry configuration for **transport, TLS, search, and authentication** when BoxLite pulls OCI images from a private or custom registry. Configured via `Options(image_registries=[...])` on the [[entities/boxlite-runtime|Boxlite]] runtime.

## Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `host` | `str` | Required | Registry host, optionally with port. Do **not** include `http://` or `https://` |
| `transport` | `str` | `"https"` | `"https"` or `"http"` |
| `skip_verify` | `bool` | `False` | Disable TLS certificate and hostname verification for HTTPS registries |
| `search` | `bool` | `False` | Include this host when resolving unqualified image references |
| `username` / `password` | `str \| None` | `None` | Basic auth credentials; provide both together |
| `bearer_token` | `str \| None` | `None` | Bearer token auth |

## Examples

```python
# Plain HTTP local registry, searched for unqualified refs
ImageRegistry(host="registry.local:5000", transport="http", search=True)

# Skip TLS verification + basic auth
ImageRegistry(host="registry.example.com", skip_verify=True, username="user", password="password")

# Bearer token auth
ImageRegistry(host="ghcr.io", bearer_token="token")
```

## Notes

- `skip_verify` is the only path to disabling TLS verification — consistent with the wiki's security posture (explicit opt-in for weaker settings; cf. [[concepts/secret-injection|Secret Injection]]).
- Relevant to [[concepts/oci-image-caching|OCI Image Caching]] when resolving image references.
