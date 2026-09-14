import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { describe, expect, it } from "vitest";

describe("getMcpServerViewDisplayName", () => {
  it("preserves custom MCP server view names", () => {
    expect(
      getMcpServerViewDisplayName({
        name: "PostHog Read Only",
        server: {
          sId: "remote_mcp_server_123",
          name: "post_hog",
        },
      })
    ).toBe("PostHog Read Only");
  });

  it("formats the server name when no custom view name is set", () => {
    expect(
      getMcpServerViewDisplayName({
        name: null,
        server: {
          sId: "remote_mcp_server_123",
          name: "github_mcp",
        },
      })
    ).toBe("GitHub MCP");
  });
});
