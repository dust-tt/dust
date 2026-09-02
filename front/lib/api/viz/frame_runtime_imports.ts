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

export type FrameRuntimeImportName =
  (typeof FRAME_RUNTIME_IMPORT_NAMES)[number];

const FRAME_RUNTIME_IMPORT_NAME_SET = new Set<string>(
  FRAME_RUNTIME_IMPORT_NAMES
);

export function isFrameRuntimeImportName(
  value: string
): value is FrameRuntimeImportName {
  return FRAME_RUNTIME_IMPORT_NAME_SET.has(value);
}
