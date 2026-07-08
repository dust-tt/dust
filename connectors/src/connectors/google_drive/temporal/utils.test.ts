import { isFileTooLargeToDownloadError } from "@connectors/connectors/google_drive/temporal/utils";
import { describe, expect, it } from "vitest";

describe("isFileTooLargeToDownloadError", () => {
  it("detects the node-fetch max-size error raised when maxContentLength is exceeded", () => {
    // Shape of the error node-fetch throws once the response body goes over the
    // configured `size` (set from gaxios `maxContentLength`).
    const err = Object.assign(
      new Error("content size at https://example.com over limit: 268435456"),
      { name: "FetchError", type: "max-size" }
    );

    expect(isFileTooLargeToDownloadError(err)).toBe(true);
  });

  it("detects the max-size error when gaxios wraps it in a GaxiosError", () => {
    // gaxios 6.x (used via google-auth-library) wraps the underlying fetch error in a GaxiosError
    // whose top-level `type` is undefined; the original FetchError (with `type: "max-size"`) is
    // nested on `.error`.
    const wrapped = Object.assign(
      new Error("content size at https://example.com over limit: 268435456"),
      {
        name: "GaxiosError",
        error: Object.assign(
          new Error(
            "content size at https://example.com over limit: 268435456"
          ),
          { name: "FetchError", type: "max-size" }
        ),
      }
    );

    expect(isFileTooLargeToDownloadError(wrapped)).toBe(true);
  });

  it("detects the Node ERR_OUT_OF_RANGE error raised when buffering a huge file", () => {
    const err = Object.assign(new Error("Array buffer allocation failed"), {
      code: "ERR_OUT_OF_RANGE",
    });

    expect(isFileTooLargeToDownloadError(err)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isFileTooLargeToDownloadError(new Error("boom"))).toBe(false);
    expect(
      isFileTooLargeToDownloadError(
        Object.assign(new Error("nope"), { type: "system" })
      )
    ).toBe(false);
    expect(isFileTooLargeToDownloadError("not an error")).toBe(false);
    expect(isFileTooLargeToDownloadError(null)).toBe(false);
  });
});
