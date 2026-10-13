import {
  FILE_OFFLOAD_FILE_SIZE_BYTES,
  FILE_OFFLOAD_IMAGE_SIZE_BYTES,
  isBinaryWithinFileOffloadLimit,
} from "@app/lib/actions/action_output_limits";
import { describe, expect, it } from "vitest";

describe("isBinaryWithinFileOffloadLimit", () => {
  it("accepts an image whose base64 encoding exactly fits the image limit", () => {
    const maxImageBytes = (FILE_OFFLOAD_IMAGE_SIZE_BYTES / 4) * 3;

    expect(
      isBinaryWithinFileOffloadLimit({
        byteLength: maxImageBytes,
        mimeType: "image/png",
      })
    ).toBe(true);
    expect(
      isBinaryWithinFileOffloadLimit({
        byteLength: maxImageBytes + 1,
        mimeType: "image/png",
      })
    ).toBe(false);
  });

  it("applies the file limit to non-image binaries", () => {
    const maxFileBytes = (FILE_OFFLOAD_FILE_SIZE_BYTES / 4) * 3;

    expect(
      isBinaryWithinFileOffloadLimit({
        byteLength: maxFileBytes,
        mimeType: "application/zip",
      })
    ).toBe(true);
    expect(
      isBinaryWithinFileOffloadLimit({
        byteLength: maxFileBytes + 1,
        mimeType: "application/zip",
      })
    ).toBe(false);
  });
});
