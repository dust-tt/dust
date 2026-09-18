import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFrameRuntimeTypes } from "../lib/frame-runtime-types/build.ts";

function copyTypesToFrameSkill(vizRoot, manifest) {
  const assets = path.resolve(
    vizRoot,
    "../front/lib/resources/skill/code_defined/global/frames/assets"
  );
  // The standalone Viz Docker build does not include Front.
  if (!fs.existsSync(assets)) {
    return;
  }

  const directory = path.join(assets, "frame-runtime");
  fs.mkdirSync(directory, { recursive: true });
  const archive = `${manifest.tarballSha256}.tgz`;
  fs.copyFileSync(
    path.join(vizRoot, "public/frame-runtime", archive),
    path.join(directory, archive)
  );
  // Front can start while Viz is rebuilding, so replace the manifest in one step.
  const stagedManifest = path.join(directory, `.manifest-${randomUUID()}.json`);
  fs.writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(stagedManifest, path.join(directory, "manifest.json"));
}

const vizRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const manifest = await buildFrameRuntimeTypes({
  vizRoot,
  outDir: path.join(vizRoot, "public/frame-runtime"),
});
copyTypesToFrameSkill(vizRoot, manifest);
process.stdout.write(
  `Built Frame runtime types ${manifest.id} (${manifest.sizeBytes} bytes).\n`
);
