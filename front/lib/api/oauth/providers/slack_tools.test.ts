import { SlackToolsOAuthProvider } from "@app/lib/api/oauth/providers/slack_tools";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

function makeConnection(metadata: Record<string, string>): OAuthConnectionType {
  return {
    connection_id: "connection-id",
    created: Date.now(),
    metadata,
    provider: "slack_tools",
    status: "finalized",
  };
}

describe("SlackToolsOAuthProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a required scope for personal authentication", () => {
    const provider = new SlackToolsOAuthProvider();

    expect(
      provider.isExtraConfigValid(
        {
          mcp_server_id: "ims_test",
          scope: "reactions:read",
        },
        "personal_actions"
      )
    ).toBe(true);
  });

  it("rejects a finalized connection that did not grant the required scope", async () => {
    const getAccessTokenSpy = vi
      .spyOn(OAuthAPI.prototype, "getAccessToken")
      .mockResolvedValue(
        new Ok({
          connection: makeConnection({ scope: "reactions:read" }),
          access_token: "test-token",
          access_token_expiry: null,
          scrubbed_raw_json: {
            authed_user: {
              scope: "channels:history,channels:read",
            },
          },
        })
      );

    const provider = new SlackToolsOAuthProvider();
    const result = await provider.checkConnectionValidPostFinalize(
      makeConnection({
        scope: "reactions:read",
        requested_team_id: "T123",
        team_id: "T123",
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("reactions:read");
      expect(result.error.message).toContain("Slack workspace admin");
    }
    expect(getAccessTokenSpy).toHaveBeenCalledWith({
      connectionId: "connection-id",
    });
  });

  it("accepts a finalized connection that granted the required scope", async () => {
    const getAccessTokenSpy = vi
      .spyOn(OAuthAPI.prototype, "getAccessToken")
      .mockResolvedValue(
        new Ok({
          connection: makeConnection({ scope: "reactions:read" }),
          access_token: "test-token",
          access_token_expiry: null,
          scrubbed_raw_json: {
            authed_user: {
              scope: "channels:history,reactions:read",
            },
          },
        })
      );

    const provider = new SlackToolsOAuthProvider();
    const result = await provider.checkConnectionValidPostFinalize(
      makeConnection({
        scope: "reactions:read",
        requested_team_id: "T123",
        team_id: "T123",
      })
    );

    expect(result.isOk()).toBe(true);
    expect(getAccessTokenSpy).toHaveBeenCalledWith({
      connectionId: "connection-id",
    });
  });

  it("rejects a connection to a different Slack team before checking scopes", async () => {
    const getAccessTokenSpy = vi.spyOn(OAuthAPI.prototype, "getAccessToken");
    const provider = new SlackToolsOAuthProvider();
    const result = await provider.checkConnectionValidPostFinalize(
      makeConnection({
        scope: "reactions:read",
        requested_team_id: "T123",
        requested_team_name: "Expected workspace",
        team_id: "T456",
        team_name: "Other workspace",
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Expected workspace (T123)");
      expect(result.error.message).toContain("Other workspace (T456)");
    }
    expect(getAccessTokenSpy).not.toHaveBeenCalled();
  });
});
