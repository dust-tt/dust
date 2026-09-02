export const FRAME_RUNTIME_IMPORT_NAMES = [
  "papaparse",
  "react",
  "recharts",
  "shadcn",
  "utils",
  "@viz/lib/utils",
  "lucide-react",
  "motion/react",
  "@dust/slideshow/v1",
  "@dust/slideshow/v2",
  "@dust/react-hooks",
] as const;

export type FrameRuntimeImportName =
  (typeof FRAME_RUNTIME_IMPORT_NAMES)[number];
