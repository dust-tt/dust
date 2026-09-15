import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildFrameValidationSnapshot } from "../lib/frame-validation/build.ts";

async function main() {
  const vizRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const snapshot = buildFrameValidationSnapshot(vizRoot);
  const result = await build({
    stdin: {
      contents: `import { runFrameValidator } from "./lib/frame-validation/run.ts";\nrunFrameValidator(${JSON.stringify(snapshot)});`,
      resolveDir: vizRoot,
      sourcefile: "frame-validator.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    minify: true,
    legalComments: "eof",
    write: false,
  });
  const script = result.outputFiles[0].text;
  const sha256 = createHash("sha256").update(script).digest("hex");
  const outputDirectory = path.join(vizRoot, "public");
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(
    path.join(outputDirectory, "frame-validator.json"),
    JSON.stringify({
      schemaVersion: 1,
      sha256,
      typescriptVersion: snapshot.typescriptVersion,
      script,
    })
  );
  await fs.writeFile(
    path.join(outputDirectory, "frame-runtime-types.json"),
    JSON.stringify({
      schemaVersion: 1,
      snapshot,
    })
  );
  process.stdout.write(
    `Built Frame validator ${sha256.slice(0, 12)} with ${Object.keys(snapshot.modules).length} modules.\n`
  );
}

void main();
