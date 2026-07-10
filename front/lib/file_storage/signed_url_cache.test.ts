import {
  DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import {
  computeSignedUrlCacheTtlMs,
  getCachedPrivateUploadSignedUrl,
} from "@app/lib/file_storage/signed_url_cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("computeSignedUrlCacheTtlMs", () => {
  it("stays comfortably under the signed URL's own expiration", () => {
    const ttlMs = computeSignedUrlCacheTtlMs(
      DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS
    );

    expect(ttlMs).toBeLessThan(DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS);
    expect(ttlMs).toBeGreaterThan(0);
  });

  it("scales with a custom expiration instead of staying fixed", () => {
    const oneHourMs = 60 * 60 * 1000;

    const defaultTtlMs = computeSignedUrlCacheTtlMs(
      DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS
    );
    const oneHourTtlMs = computeSignedUrlCacheTtlMs(oneHourMs);

    expect(oneHourTtlMs).toBeGreaterThan(defaultTtlMs);
    expect(oneHourTtlMs).toBeLessThan(oneHourMs);
  });
});

describe("getCachedPrivateUploadSignedUrl", () => {
  let getSignedUrlMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSignedUrlMock = vi
      .fn()
      .mockResolvedValue("https://signed.example.com/file.pdf");
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getSignedUrl: getSignedUrlMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("signs with the default expiration when none is provided", async () => {
    const url = await getCachedPrivateUploadSignedUrl("w/ws/files/photo.png");

    expect(url).toBe("https://signed.example.com/file.pdf");
    expect(getSignedUrlMock).toHaveBeenCalledWith("w/ws/files/photo.png", {
      expirationDelayMs: DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS,
    });
  });

  it("passes a custom expiration through to the signer", async () => {
    const oneHourMs = 60 * 60 * 1000;

    const url = await getCachedPrivateUploadSignedUrl("w/ws/files/photo.png", {
      expirationDelayMs: oneHourMs,
    });

    expect(url).toBe("https://signed.example.com/file.pdf");
    expect(getSignedUrlMock).toHaveBeenCalledWith("w/ws/files/photo.png", {
      expirationDelayMs: oneHourMs,
    });
  });
});
