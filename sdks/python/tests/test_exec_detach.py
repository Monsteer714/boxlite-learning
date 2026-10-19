"""
Integration tests for Box.exec(detach=True) (sync API).

The box bounds a detached exec: it is refused on a box that is not detached.
These tests require a working VM/libkrun setup.
"""

from __future__ import annotations

import pytest

import boxlite

pytestmark = pytest.mark.integration


class TestExecDetachSync:
    def test_detach_is_refused_on_a_box_that_is_not_detached(self, shared_sync_runtime):
        box = shared_sync_runtime.create(boxlite.BoxOptions(image="alpine:latest"))
        try:
            with pytest.raises(boxlite.InvalidStateError, match="not detached"):
                box.exec("sleep", ["1"], detach=True)
        finally:
            box.stop()

    def test_detach_runs_on_a_detached_box(self, shared_sync_runtime):
        box = shared_sync_runtime.create(
            boxlite.BoxOptions(image="alpine:latest", detach=True, auto_remove=False)
        )
        try:
            box.exec("sleep", ["4242"], detach=True)
            probe = box.exec("pgrep", ["-f", "sleep 4242"]).wait()
            assert probe.exit_code == 0
        finally:
            box.stop()
            shared_sync_runtime.remove(box.id, force=True)
