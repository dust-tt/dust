import fs from "node:fs";
import path from "node:path";
import { build } from "tsup";

export async function bundleDeclarations({
  entrySource,
  configPath,
  vizRoot,
  stageRoot,
}: {
  entrySource: string;
  configPath: string;
  vizRoot: string;
  stageRoot: string;
}): Promise<string> {
  const entryPath = path.join(stageRoot, "entry.ts");
  const bundleDirectory = path.join(stageRoot, "bundle");
  fs.writeFileSync(entryPath, entrySource);
  await build({
    entry: { index: entryPath },
    tsconfig: configPath,
    dts: { only: true, compilerOptions: { baseUrl: vizRoot } },
    format: ["esm"],
    outDir: bundleDirectory,
    silent: true,
  });
  // tsup can name the bundle index.d.mts. We package its contents as index.d.ts.
  const outputs = fs.readdirSync(bundleDirectory);
  if (outputs.length !== 1 || !/^index\.d\.[cm]?ts$/.test(outputs[0])) {
    throw new Error("Expected one Frame declaration bundle.");
  }
  return fs.readFileSync(path.join(bundleDirectory, outputs[0]), "utf8");
}
