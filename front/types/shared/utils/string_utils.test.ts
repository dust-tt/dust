import { describe, expect, it } from "vitest";

import { formatAsDisplayName } from "./string_utils";

describe("formatAsDisplayName", () => {
  it("formats special-case identifiers", () => {
    expect(formatAsDisplayName("user_id")).toBe("User ID");
    expect(formatAsDisplayName("github_mcp_server_id")).toBe(
      "GitHub MCP server ID"
    );
  });

  it("does not format special cases within words", () => {
    expect(formatAsDisplayName("video_id")).toBe("Video ID");
  });
});
