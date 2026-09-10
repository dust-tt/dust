import { FRAME_RUNTIME_IMPORT_NAMES as VALIDATOR_IMPORT_NAMES } from "@app/lib/api/viz/frame_runtime_imports";
import { describe, expect, it } from "vitest";
import { FRAME_RUNTIME_IMPORT_NAMES as RENDERER_IMPORT_NAMES } from "../../../../viz/app/lib/frame-runtime-imports";

describe("Frame runtime imports", () => {
  it("keeps the bundler import gate aligned with the renderer import map", () => {
    expect(VALIDATOR_IMPORT_NAMES).toEqual(RENDERER_IMPORT_NAMES);
  });
});
