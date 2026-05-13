import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAuthObject } from "./utils";

vi.mock("@connectors/lib/oauth", () => ({
  getOAuthConnectionAccessTokenWithThrow: vi.fn(),
}));

const CONNECTION_ID = "connection-id";
const EXPIRED_TOKEN_OFFSET_MS = 60_000;
const FRESH_TOKEN_OFFSET_MS = 60 * 60 * 1000;

type OAuthAccessToken = Awaited<
  ReturnType<typeof getOAuthConnectionAccessTokenWithThrow>
>;

function makeAccessToken({
  accessToken,
  expiry,
}: {
  accessToken: string;
  expiry: number;
}): OAuthAccessToken {
  return {
    access_token: accessToken,
    access_token_expiry: expiry,
    connection: {
      connection_id: CONNECTION_ID,
      created: Date.now(),
      metadata: {},
      provider: "google_drive",
      status: "finalized",
    },
    scrubbed_raw_json: {
      scope: "https://www.googleapis.com/auth/drive.readonly",
      token_type: "Bearer",
    },
  };
}

describe("getAuthObject", () => {
  beforeEach(() => {
    vi.mocked(getOAuthConnectionAccessTokenWithThrow).mockReset();
  });

  it("refreshes Google auth credentials through the OAuth service", async () => {
    vi.mocked(getOAuthConnectionAccessTokenWithThrow)
      .mockResolvedValueOnce(
        makeAccessToken({
          accessToken: "expired-token",
          expiry: Date.now() - EXPIRED_TOKEN_OFFSET_MS,
        })
      )
      .mockResolvedValueOnce(
        makeAccessToken({
          accessToken: "fresh-token",
          expiry: Date.now() + FRESH_TOKEN_OFFSET_MS,
        })
      );

    const auth = await getAuthObject(CONNECTION_ID);

    expect(auth.credentials.access_token).toBe("expired-token");

    const headers = await auth.getRequestHeaders();

    expect(headers.Authorization).toBe("Bearer fresh-token");
    expect(auth.credentials.access_token).toBe("fresh-token");
    expect(getOAuthConnectionAccessTokenWithThrow).toHaveBeenCalledTimes(2);
    expect(getOAuthConnectionAccessTokenWithThrow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        connectionId: CONNECTION_ID,
        provider: "google_drive",
      })
    );
    expect(getOAuthConnectionAccessTokenWithThrow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        connectionId: CONNECTION_ID,
        provider: "google_drive",
      })
    );
  });

  it("propagates OAuth refresh errors", async () => {
    const error = new ExternalOAuthTokenError(new Error("Token was revoked"));

    vi.mocked(getOAuthConnectionAccessTokenWithThrow)
      .mockResolvedValueOnce(
        makeAccessToken({
          accessToken: "expired-token",
          expiry: Date.now() - EXPIRED_TOKEN_OFFSET_MS,
        })
      )
      .mockRejectedValueOnce(error);

    const auth = await getAuthObject(CONNECTION_ID);

    await expect(auth.getRequestHeaders()).rejects.toBe(error);
    expect(getOAuthConnectionAccessTokenWithThrow).toHaveBeenCalledTimes(2);
  });
});
