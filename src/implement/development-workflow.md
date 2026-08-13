# Development Workflow: research → design → design review → develop → code design → test → code review → roll out

> This document walks each step from "issue arrives" to "PR ready", using the
> **`boxlite serve` named-volume creation & mounting** feature as the running
> example. Repo-level rules live in `CONTRIBUTING.md`; every step doubles as a
> checklist for the next feature.

## 0. Understand

Pre-requisite, not a standalone phase:

- Read `CLAUDE.md`, the nearest README, `CONTRIBUTING.md`, and the source of the
  affected modules.
- Find the smallest behavioral change; reproduce before fixing (when fixing a
  bug, write the failing test first).
- If docs and implementation disagree, record the conflict and ask before making
  an architectural assumption.

## 1. Research

**Goal: translate "what to do" into "which files change, which hop moves", all
with real `file:line` references.**

- Draw the current call stack. This feature drew two:
  - CLI `-v host:guest` mount path: `VolumeFlags::apply_to` (src/cli/src/cli.rs:880) → `resolve_user_volumes` → `classify_volume_share` → virtio-fs → gRPC → guest mount.
  - The serve-side mount entry as it should be: `POST /v1/boxes` → `create_box` (src/cli/src/commands/serve/handlers/boxes.rs:16) → `build_box_options` (serve/mod.rs:759).
- Find the gaps: the `VolumeBackend` trait (src/boxlite/src/runtime/volumes.rs:26) exists, but `impl for LocalRuntime` (rt_impl.rs:1823) returns `Unsupported` for every method; `build_box_options` never fills `BoxOptions.volumes`.
- Note the reuse: the named-volume location `{home}/volumes/{id}` shares the same root as the CLI anonymous volume `{home}/volumes/anonymous/{ulid}` — the storage layout already exists, `FilesystemLayout` creates the directories.
- Note the hook point: `TODO(#942)` (cli.rs:889) — the future CLI bare-name mount entry, the second entrance for the same capability as serve mounting.

**Output**: `src/tutorial/volume-mount-call-stack.md` (a side-by-side comparison).

## 2. Design

**Goal: pick the approach and fix the boundaries, first asking "what does each
layer need to know".**

- Storage choice: a named volume is one directory — `list` enumerates, `get`
  checks the directory, `remove` deletes it. No database table, mirroring how
  box state is persisted.
- Data model: `VolumeInfo` gains a `host_path: PathBuf` field (src/boxlite/src/volumes/store.rs:27,34), so both serve mounting and the future CLI bare-name mount can resolve the physical directory.
- Security boundary: the REST client only ever sends a `volume_id`; `host_path`
  is resolved server-side through `get_volume` — a client cannot make the server
  mount an arbitrary host directory (an import-path test pins the same policy).
- Structure: `NamedVolumeStore` is a facade exposing only `new/create/list/get/remove`;
  traversal guards, `anonymous/` exclusion, and mtime-derived creation time stay private.

## 3. Design Review

**Goal: challenge your own assumptions; check for holes.**

- "Does `host_path` belong on the wire?" → Yes. A client needs to resolve a
  `volume_id` to a mount source without a second lookup; it is informational,
  not a mount entrance.
- "Will `list` also return CLI anonymous volumes?" → No. `list` skips
  `volumes/anonymous/`, because anonymous volumes are managed by
  `VolumeFlags::apply_to`, not this store.
- "How is path traversal prevented?" → `volume_dir` (store.rs:149) rejects
  empty/`.`/`..`/ids containing `/` or `\`; `{volumes}/{id}` must be a single
  directory name.
- "Does the import path need to change too?" → No. `options_from_manifest`
  already rejects host volumes for untrusted imports (src/boxlite/src/runtime/import.rs:116);
  serve mounting is a separate entrance that likewise only accepts a `volume_id`.

## 4. Develop

**Goal: small, compilable steps, landed in dependency order.**

- **Part 1 — revive `/v1/volumes`**: rewrite `store.rs` → make `impl VolumeBackend` in `rt_impl.rs` delegate to it → fix the type cascade from `VolumeInfo.host_path` (`serve/types.rs`, `serve/mod.rs:722`, `rest/types.rs:355`).
- **Part 2 — box mounts**: `CreateBoxRequest.volumes: Vec<CreateVolumeMount>` (serve/types.rs:59) → `resolve_volume_mounts` (serve/mod.rs:736) → `build_box_options` fills `BoxOptions.volumes`.
- Compile after every step (`make cli`) so type errors are absorbed in the step
  that creates them, never accumulated.

## 5. Code Design

**Goal: match the repo's style; make the code easy to read and change.**

- Single responsibility: `resolve_volume_mounts` only maps `volume_id → VolumeSpec` plus the `guest_path` check; it holds no handler logic.
- Validate at the boundary: `guest_path` non-empty and `/`-prefixed is checked serve-side; `volume_id` validity is checked in the store.
- Named booleans: `read_only` reads directly; errors carry the operation and the resource id (`volume not found: {id}`).
- No abstractions the task doesn't need: the store exposes no interface for a future DB; the unused `volumes_dir()` getter was deleted outright (dead code immediately).

## 6. Test

**Goal: test real behavior; prove it fails first, then that the fix works. All via `make` targets.**

- Store unit tests (src/boxlite/src/volumes/store.rs:175): create/get round-trip, list excludes anonymous, remove/force tolerance, missing → NotFound, traversal ids rejected — covering branches and security checks.
- Serve wire contract: `CreateBoxRequest` parses `volumes`; `CreateVolumeMount` rejects unknown fields (including a smuggled `host_path`); `read_only` defaults to false.
- Serve resolve: a real `LocalRuntime` with a real volume directory; verify the resolved `host_path` points at the volume directory; missing → `NotFound`; relative `guest_path` → `InvalidArgument`.
- Run order (narrowest to widest):
  - `make test:unit:rust FILTER=volumes::store`
  - `make test:integration:cli FILTER=volume`
  - `make test:unit:rust` (full, incl. boxlite-shared)
  - `make fmt:check:rust`

## 7. Code Review

**Goal: read the diff as a stranger would, against CLAUDE.md.**

- Checklist: is the type cascade fully fixed? Warnings at zero? Is `deny_unknown_fields` holding? Are error mappings right (`NotFound → 404`, `InvalidArgument → 400`)?
- Issues found this time:
  - `make test:integration:cli` link failure when the disk was full — an environment problem, not a code one; resolved by clearing build cache.
  - `store.rs:63` `volumes_dir()` compile warning — no caller; deleted outright (no dead code in the PR).
- Cross-check: per CLAUDE.md "verify external findings against the working tree", run `git grep`/`git diff` before acting.

## 8. Roll Out

**Goal: package the change as a spec-compliant PR with all gates green.**

- Fill `.github/pull_request_template.md`, which requires a **before/after call graph** (one line per hop: `fn_name (Type · file:line) — role`); a feature PR carries no `Fixes #`.
- Commit with Conventional Commits: `feat(runtime): implement named-volume backend and serve mounts`.
- Run the PR gates: `make fmt:check:rust`, `make test:unit:rust`, `make test:integration:cli` (FILTER first, then full).
- No process narrative, no pasted logs, no secrets in the PR description (`CONTRIBUTING.md#commit--pr-messages`).
