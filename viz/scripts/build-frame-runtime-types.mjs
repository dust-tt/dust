import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFrameRuntimeTypes } from "../lib/frame-runtime-types/build.ts";

const vizRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const manifest = await buildFrameRuntimeTypes({
  vizRoot,
  outDir: path.join(vizRoot, "public/frame-runtime"),
});
process.stdout.write(
  `Built Frame runtime types ${manifest.id} (${manifest.sizeBytes} bytes).\n`
);
