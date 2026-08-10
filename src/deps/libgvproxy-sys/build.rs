use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

/// Locate a Go binary whose GOARCH matches the host architecture.
///
/// On Apple Silicon (aarch64) macOS, many developer machines still have the
/// x86_64 (Rosetta) Go installed at /usr/local/opt/go.  That Go defaults to
/// amd64 and cannot cross-compile CGo code for arm64 — the result is an rlib
/// full of x86_64 objects that the linker ignores.  Prefer an arm64-native Go
/// when it exists and the host is aarch64.
fn go_root() -> Option<&'static str> {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        let native_go_root = "/opt/homebrew/opt/go/libexec";
        if Path::new(native_go_root).is_dir() {
            return Some(native_go_root);
        }
    }
    None
}

fn find_go() -> String {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        let native_go = "/opt/homebrew/opt/go/libexec/bin/go";
        if Path::new(native_go).is_file() {
            println!("cargo:warning=Using arm64 Go: {native_go}");
            return native_go.into();
        }
        println!("cargo:warning=arm64 Go not found at {native_go}, falling back to PATH");
    }
    "go".into()
}

/// Builds libgvproxy from Go sources as a C static archive.
///
/// Steps:
/// 1. Downloads Go module dependencies
/// 2. Compiles Go code as a C archive (static library)
fn build_gvproxy(source_dir: &Path, output_path: &Path) {
    let go = find_go();
    println!("cargo:warning=Building libgvproxy from Go sources...");

    // When an explicit GOROOT is needed (e.g. Apple Silicon with both
    // x86_64 and arm64 Go installed, and the environment's GOROOT points
    // at the wrong one), thread it through to every Go invocation.
    let goroot = go_root();

    // Download Go dependencies
    let mut mod_cmd = Command::new(&go);
    mod_cmd.args(["mod", "download"]).current_dir(source_dir);
    if let Some(root) = goroot {
        mod_cmd.env("GOROOT", root);
    }
    let download_status = mod_cmd
        .status()
        .expect("Failed to run 'go mod download' - ensure Go is installed");

    if !download_status.success() {
        panic!("Failed to download Go module dependencies");
    }

    // Build as C archive (static library)
    let mut build_cmd = Command::new(&go);
    build_cmd.args(["build", "-buildmode=c-archive"]);
    if let Some(root) = goroot {
        build_cmd.env("GOROOT", root);
    }

    // Use vendor directory if present
    if source_dir.join("vendor").exists() {
        build_cmd.args(["-mod=vendor"]);
    }

    build_cmd.args([
        "-o",
        output_path.to_str().expect("Invalid output path"),
        ".",
    ]);

    let build_status = build_cmd
        .current_dir(source_dir)
        .status()
        .expect("Failed to run 'go build' - ensure Go is installed");

    if !build_status.success() {
        panic!("Failed to build libgvproxy");
    }

    println!("cargo:warning=Successfully built libgvproxy");
}

fn main() {
    // Rebuild when any Go source file changes.
    // cargo:rerun-if-changed on a directory only detects file additions/removals,
    // not content changes. Walk the directory and watch each .go file individually.
    let bridge_dir = Path::new("gvproxy-bridge");
    if bridge_dir.is_dir() {
        for entry in fs::read_dir(bridge_dir).expect("Failed to read gvproxy-bridge directory") {
            let entry = entry.expect("Failed to read directory entry");
            let path = entry.path();
            if path
                .extension()
                .is_some_and(|ext| ext == "go" || ext == "mod" || ext == "sum")
            {
                println!("cargo:rerun-if-changed={}", path.display());
            }
        }
    }
    println!("cargo:rerun-if-changed=gvproxy-bridge"); // also watch for new files
    println!("cargo:rerun-if-env-changed=BOXLITE_DEPS_STUB");

    // Auto-detect crates.io download: Cargo injects .cargo_vcs_info.json into
    // published packages. When present, enter stub mode since Go sources are
    // excluded from the package and building from source is not possible.
    if env::var("BOXLITE_DEPS_STUB").is_err() {
        let manifest_dir = std::path::PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
        if manifest_dir.join(".cargo_vcs_info.json").exists() {
            // SAFETY: build.rs is single-threaded; no concurrent env var access.
            unsafe { env::set_var("BOXLITE_DEPS_STUB", "1") };
        }
    }

    // Check for stub mode (for CI linting or crates.io install)
    if env::var("BOXLITE_DEPS_STUB").is_ok() {
        println!("cargo:warning=BOXLITE_DEPS_STUB mode: skipping libgvproxy build");
        println!("cargo:LIBGVPROXY_BOXLITE_DEP=/nonexistent");
        return;
    }

    let out_dir = env::var("OUT_DIR").expect("OUT_DIR not set");
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");

    let source_dir = Path::new(&manifest_dir).join("gvproxy-bridge");
    let lib_output = Path::new(&out_dir).join("libgvproxy.a");

    // Build libgvproxy from Go sources
    // Note: cargo only re-runs this script when rerun-if-changed files change,
    // so no extra caching is needed here.
    build_gvproxy(&source_dir, &lib_output);

    // Copy header file for downstream C/C++ usage (optional)
    let header_src = source_dir.join("libgvproxy.h");
    if header_src.exists() {
        let header_dst = Path::new(&out_dir).join("libgvproxy.h");
        fs::copy(&header_src, &header_dst).expect("Failed to copy libgvproxy.h");
    }

    // Tell Cargo where to find the library
    println!("cargo:rustc-link-search=native={}", out_dir);
    println!("cargo:rustc-link-lib=static=gvproxy");

    // Transitive dependencies from the Go runtime (embedded in the c-archive).
    // Go's net package uses the CGO resolver by default, which calls res_search
    // from libresolv for DNS lookups on both macOS and Linux.
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=CoreFoundation");
        println!("cargo:rustc-link-lib=framework=Security");
    }
    // On Linux, force static linking of libresolv to ensure the shim binary
    // remains fully static when built with crt-static. Without this, the linker
    // picks libresolv.so (dynamic), making the binary dynamically linked and
    // causing SIGSEGV on TLS access (fs:[0x28]) on some VMs.
    // When building with --target, Rust may not include the system library
    // paths, so we add them explicitly for the linker to find libresolv.a.
    #[cfg(target_os = "linux")]
    {
        let arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
        // Debian/Ubuntu: /usr/lib/<triple>
        let gnu_triple = match arch.as_str() {
            "x86_64" => "x86_64-linux-gnu",
            "aarch64" => "aarch64-linux-gnu",
            _ => "x86_64-linux-gnu",
        };
        println!("cargo:rustc-link-search=native=/usr/lib/{}", gnu_triple);
        // RHEL/manylinux: /usr/lib64
        println!("cargo:rustc-link-search=native=/usr/lib64");
        println!("cargo:rustc-link-lib=static=resolv");
    }
    #[cfg(not(target_os = "linux"))]
    println!("cargo:rustc-link-lib=resolv");

    // Expose library directory to downstream crates (used by boxlite/build.rs)
    // Convention: {LIBNAME}_BOXLITE_DEP=<path> for auto-discovery
    println!("cargo:LIBGVPROXY_BOXLITE_DEP={}", out_dir);
}
