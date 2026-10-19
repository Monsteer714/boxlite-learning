//! `boxlite exec -d` over REST keeps the exec past serve's reaper.
//!
//! The caps are shortened so the reaper acts within its 30 s tick: a plain,
//! never-attached exec gets SIGHUP there, so only a detached one is still
//! running afterwards.

mod common;

use common::serve::ServeChild;
use std::process::Output;
use std::time::{Duration, Instant};

fn stdout(out: &Output) -> String {
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn stderr(out: &Output) -> String {
    String::from_utf8_lossy(&out.stderr).trim().to_string()
}

#[test]
fn exec_detach_over_rest_outlives_the_reaper() {
    let serve = ServeChild::start_with_env(&[
        ("BOXLITE_RECONNECT_GRACE", "2s"),
        ("BOXLITE_SHUTDOWN_GRACE", "1s"),
        ("BOXLITE_MAX_SESSION_LIFETIME", "5s"),
    ]);

    let created = serve.client(&["create", "alpine:latest", "sleep", "600"]);
    assert!(
        created.status.success(),
        "create failed: {}",
        stderr(&created)
    );
    let box_id = stdout(&created);
    let started = serve.client(&["start", &box_id]);
    assert!(
        started.status.success(),
        "start failed: {}",
        stderr(&started)
    );

    let detached = serve.client(&["exec", "-d", &box_id, "--", "sleep", "4242"]);
    assert!(
        detached.status.success(),
        "exec -d failed: {}",
        stderr(&detached)
    );

    // One full reaper tick past every shortened cap.
    std::thread::sleep(Duration::from_secs(40));
    let probe = serve.client(&["exec", &box_id, "--", "pgrep", "-f", "sleep 4242"]);

    // Tear down before asserting, so a failure is not replaced by a leaked-shim panic.
    let removed = serve.client(&["rm", "--force", &box_id]);
    assert!(removed.status.success(), "rm failed: {}", stderr(&removed));
    serve.wait_until_no_boxes();

    assert!(
        probe.status.success(),
        "the detached exec must outlive the reaper; pgrep said: {}",
        stderr(&probe)
    );
    assert!(
        !stdout(&detached).is_empty(),
        "exec -d must print the execution id"
    );
}

/// The box bounds a detached exec. A foreground `run --url` box is not
/// detached, so `exec -d` into it must fail instead of starting a process
/// that box will end.
#[test]
fn exec_detach_is_refused_on_a_foreground_run_box() {
    let serve = ServeChild::start();
    let mut foreground =
        serve.spawn_client(&["run", "--name", "fgbox", "alpine:latest", "sleep", "120"]);

    let deadline = Instant::now() + Duration::from_secs(60);
    while !serve
        .client(&["exec", "fgbox", "--", "true"])
        .status
        .success()
    {
        assert!(Instant::now() < deadline, "foreground box never ran");
        std::thread::sleep(Duration::from_millis(500));
    }

    let detached = serve.client(&["exec", "-d", "fgbox", "--", "sleep", "1"]);

    let _ = foreground.kill();
    let _ = foreground.wait();
    let removed = serve.client(&["rm", "--force", "fgbox"]);
    assert!(removed.status.success(), "rm failed: {}", stderr(&removed));
    serve.wait_until_no_boxes();

    assert!(
        !detached.status.success(),
        "exec -d on a box that is not detached must fail"
    );
    assert!(
        stderr(&detached).contains("not detached"),
        "unexpected stderr: {}",
        stderr(&detached)
    );
}
