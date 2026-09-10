import type { FrameRuntimeImportName } from "@viz/app/lib/frame-runtime-imports";
import * as dustSlideshowV1 from "@viz/components/dust/slideshow/v1";
import * as dustSlideshowV2 from "@viz/components/dust/slideshow/v2";
import * as shadcnAll from "@viz/components/ui";
import * as utilsAll from "@viz/lib/utils";
import * as lucideAll from "lucide-react";
import * as motionAll from "motion/react";
import * as papaparseAll from "papaparse";
import * as reactAll from "react";
import * as rechartsAll from "recharts";

export type FrameRuntimeStaticImportName = Exclude<
  FrameRuntimeImportName,
  "@dust/react-hooks"
>;

/**
 * The modules a Frame can import that do not depend on the rendering context. The Frame runtime
 * types artifact is generated from the same modules; `frame-runtime-modules.test.ts` keeps the
 * two aligned.
 */
export const FRAME_RUNTIME_STATIC_MODULES = {
  papaparse: papaparseAll,
  react: reactAll,
  recharts: rechartsAll,
  shadcn: shadcnAll,
  // Legacy support for utils from previous versions.
  utils: utilsAll,
  // New location for utils.
  "@viz/lib/utils": utilsAll,
  "lucide-react": lucideAll,
  "motion/react": motionAll,
  "@dust/slideshow/v1": dustSlideshowV1,
  "@dust/slideshow/v2": dustSlideshowV2,
} satisfies Record<FrameRuntimeStaticImportName, unknown>;
