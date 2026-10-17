import { SlackOAuthProvider } from "@app/lib/api/oauth/providers/slack";
import { describe, expect, it } from "vitest";

describe("SlackOAuthProvider.isExtraConfigValid", () => {
  const provider = new SlackOAuthProvider();

  it("accepts mcp_server_id for platform_actions (Slack Bot tool connect)", () => {
    expect(
      provider.isExtraConfigValid(
        { mcp_server_id: "ims_123" },
        "platform_actions"
      )
    ).toBe(true);
    expect(provider.isExtraConfigValid({}, "platform_actions")).toBe(true);
  });

  it("rejects other keys for platform_actions", () => {
    expect(
      provider.isExtraConfigValid(
        { mcp_server_id: "ims_123", client_id: "x" },
        "platform_actions"
      )
    ).toBe(false);
  });

  it("keeps the bot use case strict", () => {
    expect(provider.isExtraConfigValid({}, "bot")).toBe(true);
    expect(
      provider.isExtraConfigValid({ mcp_server_id: "ims_123" }, "bot")
    ).toBe(false);
  });
});
