import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { z } from "zod";
import { validateFrameSource } from "../../../front/lib/api/viz/frame_type_checker.ts";
import type { FrameValidationSnapshot } from "../../../front/lib/api/viz/frame_type_checker_types.ts";

// Full manifest validation remains owned by dsbx frame validate. This command selects only
// the UI entry and follows its imports, leaving server functions and database schemas alone.
const UIManifestSchema = z.object({
  version: z.literal(1),
  uiEntryPoint: z.string().min(1).default("index.tsx"),
});

export function runFrameValidationCli(snapshot: FrameValidationSnapshot): void {
  if (snapshot.typescriptVersion !== ts.version) {
    process.stderr.write(
      "The Frame validator and its declarations use different TypeScript versions.\n"
    );
    process.exitCode = 2;
    return;
  }
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const paths = args.filter((arg) => arg !== "--json");
  if (paths.length !== 1 || paths[0] === "--help") {
    process.stdout.write(
      "Usage: bun frame-validator.cjs [--json] <manifest.json|entry.tsx>\n"
    );
    process.exitCode = paths[0] === "--help" ? 0 : 2;
    return;
  }

  try {
    const inputPath = fs.realpathSync(paths[0]);
    const root = path.dirname(inputPath);
    const entryPoint = inputPath.endsWith(".json")
      ? UIManifestSchema.parse(JSON.parse(fs.readFileSync(inputPath, "utf8")))
          .uiEntryPoint
      : path.basename(inputPath);
    const diagnostics = validateFrameSource({
      snapshot,
      entryPoint,
      readSource: (relativePath) => {
        const fileName = path.resolve(root, relativePath);
        if (!fileName.startsWith(`${root}${path.sep}`)) {
          return undefined;
        }
        let realPath: string;
        try {
          realPath = fs.realpathSync(fileName);
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            return undefined;
          }
          throw error;
        }
        if (
          !realPath.startsWith(`${root}${path.sep}`) ||
          !fs.statSync(realPath).isFile()
        ) {
          return undefined;
        }
        return fs.readFileSync(realPath, "utf8");
      },
    });
    if (json) {
      process.stdout.write(
        `${JSON.stringify({
          ok: diagnostics.length === 0,
          typescriptVersion: snapshot.typescriptVersion,
          diagnostics,
        })}\n`
      );
    } else if (diagnostics.length === 0) {
      process.stdout.write(`Frame UI type check passed (${entryPoint}).\n`);
    } else {
      for (const diagnostic of diagnostics.slice(0, 50)) {
        process.stdout.write(
          `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} error TS${diagnostic.code}: ${diagnostic.message}\n`
        );
      }
      if (diagnostics.length > 50) {
        process.stdout.write(
          `${diagnostics.length - 50} additional diagnostics. Use --json for all diagnostics.\n`
        );
      }
    }
    process.exitCode = diagnostics.length > 0 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Frame validation could not run: ${message}\n`);
    process.exitCode = 2;
  }
}
