import { describe, expect, it } from "vitest";

import { formatAsDisplayName } from "./string_utils";

describe("formatAsDisplayName", () => {
  it("formats special-case identifiers", () => {
    expect(formatAsDisplayName("user_id")).toBe("User ID");
    expect(formatAsDisplayName("github_mcp_server_id")).toBe(
      "GitHub MCP server ID"
    );
  });

  it("keeps the casing of a special case that starts the name", () => {
    expect(formatAsDisplayName("n8n")).toBe("n8n");
    expect(formatAsDisplayName("github")).toBe("GitHub");
    expect(formatAsDisplayName("websearch")).toBe("Web search");
  });

  it("does not format special cases within words", () => {
    expect(formatAsDisplayName("video_id")).toBe("Video ID");
  });
});
