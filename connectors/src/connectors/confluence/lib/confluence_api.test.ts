import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getConfluenceAccessToken } from "./confluence_api";

const mocks = vi.hoisted(() => ({
  getOAuthConnectionAccessTokenWithThrow: vi.fn(),
}));

vi.mock("@connectors/lib/oauth", () => ({
  getOAuthConnectionAccessTokenWithThrow:
    mocks.getOAuthConnectionAccessTokenWithThrow,
}));

describe("getConfluenceAccessToken", () => {
  beforeEach(() => {
    mocks.getOAuthConnectionAccessTokenWithThrow.mockReset();
  });

  it("returns the Confluence access token", async () => {
    mocks.getOAuthConnectionAccessTokenWithThrow.mockResolvedValue({
      access_token: "access-token",
    });

    const result = await getConfluenceAccessToken("connection-id");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("access-token");
    }
  });

  it("preserves ExternalOAuthTokenError for revoked tokens", async () => {
    const error = new ExternalOAuthTokenError(new Error("Token revoked."));
    mocks.getOAuthConnectionAccessTokenWithThrow.mockRejectedValue(error);

    const result = await getConfluenceAccessToken("connection-id");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(error);
    }
  });

  it("rethrows unexpected repository errors", async () => {
    const error = new Error("Missing OAUTH_API configuration");
    mocks.getOAuthConnectionAccessTokenWithThrow.mockRejectedValue(error);

    await expect(getConfluenceAccessToken("connection-id")).rejects.toBe(error);
  });
});
