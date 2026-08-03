// `dsbx` embeds the functions runner bundle via `include_str!`. The bundle is a
// generated build artifact (Zod inlined), NOT committed: it is produced by
// `bun run build` in `functions-runner/` before `dsbx` is compiled (CI, the
// release workflow, and the upsert script all run that step on the host first;
// `cross` then mounts it into the build container).
//
// This script does not run `bun` itself — that would require `bun` inside the
// `cross`/musl build image. It only (1) fails the build early with a clear
// message if the bundle is missing, and (2) tells Cargo to recompile when the
// bundle changes (which `include_str!` does not track on its own).

use std::path::Path;

fn main() {
    let bundle = "functions-runner/runner.js";

    println!("cargo:rerun-if-changed={bundle}");
    println!("cargo:rerun-if-changed=build.rs");

    if !Path::new(bundle).exists() {
        panic!(
            "\n{bundle} is missing. It is a generated bundle and is not committed.\n\
             Build it before compiling dsbx:\n\
             \n    (cd cli/dust-sandbox/functions-runner && bun install && bun run build)\n"
        );
    }
}
