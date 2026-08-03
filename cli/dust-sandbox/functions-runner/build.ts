// Build a sandbox function: bundle its source with its relative imports into a single module and
// extract its JSON-Schema I/O contract.
//
// External packages (zod and the rest of the sandbox "harness") are left as imports, not inlined:
// the sandbox provides them at invocation time, which keeps bundles small and shares a single zod
// instance with the runner.
//
// The bundle and schema are written to files rather than returned on stdout:
// `dsbx function build` invocations are read back out-of-band by the caller
// (sandbox results can be truncated). stdout only carries a small
// `{ ok: true }` / `{ ok: false, error }` envelope.

import { getFunctionSchema } from "./schema.ts";

export type BuildErrorKind =
  | "bad_args"
  | "build_failed"
  | "schema_extraction_failed";

export type BuildResult =
  | { ok: true }
  | { ok: false; error: { kind: BuildErrorKind; message: string } };

export async function build(
  srcPath: string,
  outBundlePath: string,
  outSchemaPath: string
): Promise<BuildResult> {
  // 1. Bundle the source with its relative imports into one module. External packages stay
  //    as imports (`packages: "external"`) for the sandbox harness to resolve at invocation time.
  let bundle: Blob;
  try {
    const result = await Bun.build({
      entrypoints: [srcPath],
      target: "bun",
      packages: "external",
      splitting: false,
    });
    if (!result.success) {
      return {
        ok: false,
        error: {
          kind: "build_failed",
          message: result.logs.map((log) => String(log)).join("\n"),
        },
      };
    }

    bundle = result.outputs[0];
  } catch (e) {
    return {
      ok: false,
      error: { kind: "build_failed", message: errorMessage(e) },
    };
  }

  // The build artifact is an in-memory Blob. Hand it to Bun.write directly so its bytes go
  // straight to the file instead of being decoded into a JS string first.
  await Bun.write(outBundlePath, bundle);

  // 2. Extract the schema from the built artifact. Importing it also validates that the bundle
  //    loads and exposes a well-formed `schema` export.
  try {
    const schema = await getFunctionSchema(outBundlePath);

    await Bun.write(outSchemaPath, JSON.stringify(schema));
  } catch (e) {
    return {
      ok: false,
      error: { kind: "schema_extraction_failed", message: errorMessage(e) },
    };
  }

  return { ok: true };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
