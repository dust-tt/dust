import type { FrameRuntimeImportName } from "@viz/app/lib/frame-runtime-imports";
import { FRAME_RUNTIME_IMPORT_NAMES } from "@viz/app/lib/frame-runtime-imports";
import type { FrameRuntimeStaticImportName } from "@viz/app/lib/frame-runtime-modules";
import { FRAME_RUNTIME_STATIC_MODULES } from "@viz/app/lib/frame-runtime-modules";
import { FRAME_RUNTIME_MODULE_SOURCES } from "@viz/app/lib/frame-runtime-types/build";
import { describe, expect, it } from "vitest";

function isStaticImportName(
  importName: FrameRuntimeImportName
): importName is FrameRuntimeStaticImportName {
  return importName !== "@dust/react-hooks";
}

describe("Frame runtime modules", () => {
  it("generates runtime types from the modules the renderer exposes", async () => {
    for (const importName of FRAME_RUNTIME_IMPORT_NAMES) {
      if (!isStaticImportName(importName)) {
        continue;
      }
      const source: Record<string, unknown> = await import(
        FRAME_RUNTIME_MODULE_SOURCES[importName]
      );

      expect(Object.keys(source).sort(), importName).toEqual(
        Object.keys(FRAME_RUNTIME_STATIC_MODULES[importName]).sort()
      );
    }
  });
});
