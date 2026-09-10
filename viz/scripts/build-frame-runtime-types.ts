// Generates the Frame runtime types artifact into `public/frame-runtime/` before `next build`.
// Run from the viz package root: `npm run build:frame-runtime-types`.
import path from "node:path";

import { buildFrameRuntimeTypes } from "@viz/app/lib/frame-runtime-types/build";
import logger from "@viz/app/lib/logger";

const vizRoot = process.cwd();
const manifest = buildFrameRuntimeTypes({
  vizRoot,
  outDir: path.join(vizRoot, "public", "frame-runtime"),
});
logger.info({ manifest }, "Built Frame runtime types artifact");
