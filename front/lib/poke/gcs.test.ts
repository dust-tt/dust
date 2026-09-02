import { makeGcsConsoleUrl } from "@app/lib/poke/gcs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getOptionalGoogleCloudProjectIdMock = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/config", () => ({
  default: {
    getOptionalGoogleCloudProjectId: getOptionalGoogleCloudProjectIdMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("makeGcsConsoleUrl", () => {
  it("returns null when GOOGLE_CLOUD_PROJECT_ID is unset", () => {
    getOptionalGoogleCloudProjectIdMock.mockReturnValue(undefined);

    expect(makeGcsConsoleUrl("my-bucket", "some/prefix/")).toBeNull();
  });

  it("percent-encodes a prefix segment containing a space", () => {
    getOptionalGoogleCloudProjectIdMock.mockReturnValue("my-project");

    expect(makeGcsConsoleUrl("my-bucket", "frames/my notes/")).toBe(
      "https://console.cloud.google.com/storage/browser/my-bucket/frames/my%20notes/?project=my-project"
    );
  });

  it("percent-encodes a prefix segment containing a hash", () => {
    getOptionalGoogleCloudProjectIdMock.mockReturnValue("my-project");

    expect(makeGcsConsoleUrl("my-bucket", "frames/a#b.tsx/")).toBe(
      "https://console.cloud.google.com/storage/browser/my-bucket/frames/a%23b.tsx/?project=my-project"
    );
  });
});
