import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { frameV2ContentType } from "@app/types/files";
import { describe, expect, it } from "vitest";

describe("getFileTypeIcon", () => {
  it("draws a Frames v2 manifest as a Frame, not as the JSON its name suggests", () => {
    expect(getFileTypeIcon(frameV2ContentType, "manifest.json")).toBe(
      getFileTypeIcon(frameV2ContentType, "index.tsx")
    );
  });

  it("still falls back to the extension when the content type is unknown", () => {
    expect(getFileTypeIcon("application/octet-stream", "notes.json")).toBe(
      getFileTypeIcon("application/json", "notes.json")
    );
  });
});
