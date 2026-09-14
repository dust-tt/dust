import {
  isFileTooLargeToDownloadError,
  isGoogleDriveRateLimitError,
} from "@connectors/connectors/google_drive/temporal/utils";
import { GaxiosError } from "googleapis-common";
import { describe, expect, it } from "vitest";

// Builds an object that passes the `instanceof GaxiosError` guard with the given
// HTTP status and error payload, mirroring how googleapis surfaces API errors.
function makeGaxiosError(status: number, reason?: string): GaxiosError {
  return Object.assign(Object.create(GaxiosError.prototype), {
    message: "Google API error",
    response: {
      status,
      data: {
        error: reason
          ? { errors: [{ reason, message: "User rate limit exceeded." }] }
          : {},
      },
    },
  });
}

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

describe("isGoogleDriveRateLimitError", () => {
  it("detects a 403 'User rate limit exceeded' error", () => {
    expect(
      isGoogleDriveRateLimitError(makeGaxiosError(403, "userRateLimitExceeded"))
    ).toBe(true);
  });

  it("detects other rate-limit reasons on 403 and 429", () => {
    expect(
      isGoogleDriveRateLimitError(makeGaxiosError(403, "rateLimitExceeded"))
    ).toBe(true);
    expect(
      isGoogleDriveRateLimitError(makeGaxiosError(429, "rateLimitExceeded"))
    ).toBe(true);
  });

  it("does not confuse a 403 permission loss with a rate limit", () => {
    expect(
      isGoogleDriveRateLimitError(
        makeGaxiosError(403, "insufficientFilePermissions")
      )
    ).toBe(false);
    // 403 with no structured reason (bare permission denial).
    expect(isGoogleDriveRateLimitError(makeGaxiosError(403))).toBe(false);
  });

  it("returns false for unrelated statuses and non-Gaxios errors", () => {
    expect(
      isGoogleDriveRateLimitError(makeGaxiosError(404, "rateLimitExceeded"))
    ).toBe(false);
    expect(isGoogleDriveRateLimitError(new Error("boom"))).toBe(false);
    expect(isGoogleDriveRateLimitError(null)).toBe(false);
  });
});
