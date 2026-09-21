import fs from "node:fs";
import path from "node:path";
import {
  type FrameRuntimeTypesManifest,
  publishRuntimeTypes,
} from "./archive.ts";
import { bundleDeclarations } from "./bundle.ts";
import { createValidationFiles } from "./config.ts";
import { inspectFrameRuntime } from "./runtime.ts";

export type { FrameRuntimeTypesManifest } from "./archive.ts";

/**
 * @cc [owner:flvndvd,label:product] frame-types-from-renderer
 * The artifact MUST derive its public modules and bound hook signatures from the actual Frame
 * runtime factory and use Viz's installed dependency declarations. It MUST contain declarations
 * and configuration only, with paths that work after extraction outside this repository.
 * Viz's own declarations MUST be bundled with standard declaration tooling.
 */
export async function buildFrameRuntimeTypes({
  vizRoot,
  outDir,
}: {
  vizRoot: string;
  outDir: string;
}): Promise<FrameRuntimeTypesManifest> {
  const stageRoot = fs.mkdtempSync(path.join(vizRoot, ".frame-runtime-"));
  try {
    const runtime = inspectFrameRuntime(vizRoot);
    const declarations = await bundleDeclarations({
      entrySource: runtime.entrySource,
      configPath: runtime.configPath,
      vizRoot,
      stageRoot,
    });
    const { files: configFiles, metadata } = createValidationFiles(
      runtime.modules
    );
    const files = new Map(runtime.files);
    files.set("index.d.ts", declarations);
    configFiles.forEach((content, fileName) => files.set(fileName, content));
    return publishRuntimeTypes({ files, metadata, stageRoot, outDir });
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}
