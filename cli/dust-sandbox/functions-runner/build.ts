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

import { dirname } from "node:path";
import { readDeclaredDatabases, validateDeclaredDatabases } from "./db.ts";
import { getFunctionSchema } from "./schema.ts";
import type { DatabaseSchemaErrorKind } from "./types/db.ts";

export type BuildErrorKind =
  | "bad_args"
  | "build_failed"
  | "schema_extraction_failed"
  | DatabaseSchemaErrorKind;

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
  let schema;
  try {
    schema = await getFunctionSchema(outBundlePath);
  } catch (e) {
    return {
      ok: false,
      error: { kind: "schema_extraction_failed", message: errorMessage(e) },
    };
  }

  // 3. Validate the declared databases' schema files when the function declares any —
  //    nothing about databases travels in the schema file: the declaration lives in the
  //    bundle's own `schema` export and the shapes live in the schema files and the live
  //    database. Schema files resolve relative to the SOURCE directory: the bundle has
  //    already inlined its own copy of them.
  const declared = await readDeclaredDatabases(outBundlePath);
  if (declared.isErr()) {
    return {
      ok: false,
      error: { kind: declared.error.kind, message: declared.error.message },
    };
  }
  if (declared.value.length > 0) {
    const validated = await validateDeclaredDatabases(
      dirname(srcPath),
      declared.value
    );
    if (validated.isErr()) {
      return {
        ok: false,
        error: { kind: validated.error.kind, message: validated.error.message },
      };
    }
  }

  await Bun.write(outSchemaPath, JSON.stringify(schema));

  return { ok: true };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
