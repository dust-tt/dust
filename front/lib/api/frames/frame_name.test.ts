import {
  getFrameV2NameFromMountFilePath,
  validateFrameV2Name,
} from "@app/lib/api/frames/frame_name";
import { MAX_FRAME_NAME_LENGTH } from "@app/types/api/frame_manifest";
import { describe, expect, it } from "vitest";

describe("getFrameV2NameFromMountFilePath", () => {
  it("returns the folder holding the manifest", () => {
    expect(
      getFrameV2NameFromMountFilePath(
        "w/w1/pods/p1/files/Sales Dashboard/manifest.json"
      )
    ).toBe("Sales Dashboard");
  });

  it("returns null when the path is not a manifest", () => {
    expect(
      getFrameV2NameFromMountFilePath("w/w1/pods/p1/files/Status/index.tsx")
    ).toBeNull();
  });

  it("returns null for a manifest with no folder of its own", () => {
    expect(getFrameV2NameFromMountFilePath("manifest.json")).toBeNull();
  });
});

describe("validateFrameV2Name", () => {
  it("accepts and trims a plain name", () => {
    const result = validateFrameV2Name("  Sales Dashboard  ");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("Sales Dashboard");
    }
  });

  it.each(["", "   ", "a/b", "a\\b", ".", ".."])("rejects %j", (candidate) => {
    expect(validateFrameV2Name(candidate).isErr()).toBe(true);
  });

  it("rejects a name longer than the limit", () => {
    expect(
      validateFrameV2Name("a".repeat(MAX_FRAME_NAME_LENGTH + 1)).isErr()
    ).toBe(true);
  });
});
