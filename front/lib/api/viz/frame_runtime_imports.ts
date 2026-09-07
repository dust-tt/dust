// Mirrors the import map owned by viz/app/lib/frame-runtime-imports.ts. The sync test fails if the
// renderer changes without updating publication validation.
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
