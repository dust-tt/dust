import { FRAME_RUNTIME_IMPORT_NAMES as VALIDATOR_IMPORT_NAMES } from "@app/lib/api/viz/frame_runtime_imports";
import { describe, expect, it } from "vitest";
import { FRAME_RUNTIME_IMPORT_NAMES as RENDERER_IMPORT_NAMES } from "../../../../viz/app/lib/frame-runtime-imports";
import vizPackage from "../../../../viz/package.json";
import frontPackage from "../../../package.json";

describe("Frame runtime imports", () => {
  it("keeps publication validation aligned with the renderer import map", () => {
    expect(VALIDATOR_IMPORT_NAMES).toEqual(RENDERER_IMPORT_NAMES);
  });

  it("keeps aliased declarations aligned with renderer package versions", () => {
    expect(frontPackage.devDependencies).toMatchObject({
      "@dust-frame-runtime/lucide-react": `npm:lucide-react@${vizPackage.dependencies["lucide-react"].replace("^", "")}`,
      "@dust-frame-runtime/motion": `npm:motion@${vizPackage.dependencies.motion.replace("^", "")}`,
      "@dust-frame-runtime/recharts": `npm:recharts@${vizPackage.dependencies.recharts}`,
    });
  });
});
