import { assert, describe, expect, it } from "vitest";

import {
  getPrefixedToolName,
  TOOL_NAME_SEPARATOR,
} from "@app/lib/actions/mcp_actions";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";

describe("getPrefixedToolName", () => {
  const mockConfig: ServerSideMCPServerConfigurationType = {
    name: "Test Server",
    type: "mcp_server_configuration",
    sId: "sId1234",
    id: 1,
    description: "Test server description",
    mcpServerViewId: "test-view-id",
    dataSources: null,
    tables: null,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    dustAppConfiguration: null,
    internalMCPServerId: null,
  };

  it("should correctly prefix and slugify tool names", () => {
    const result = getPrefixedToolName(mockConfig, "My Tool");
    expect(result.isOk()).toBe(true);
    assert(result.isOk());
    expect(result.value).toBe(`test_server${TOOL_NAME_SEPARATOR}my_tool`);
  });

  it("should handle tool names that are too long for prefixing", () => {
    const longToolName = "a".repeat(60);
    const result = getPrefixedToolName(mockConfig, longToolName);
    expect(result.isOk()).toBe(true);
    assert(result.isOk());
    expect(result.value).toBe("a".repeat(60));
  });

  it("should handle tool names that are too long to use at all", () => {
    const extremelyLongName = "a".repeat(65);
    const result = getPrefixedToolName(mockConfig, extremelyLongName);
    expect(result.isErr()).toBe(true);
    assert(result.isErr());
    expect(result.error.message).toBe(
      `Tool name "${extremelyLongName}" is too long. Maximum length is 64 characters.`
    );
  });

  it("should truncate server name when needed", () => {
    const longServerConfig: ServerSideMCPServerConfigurationType = {
      ...mockConfig,
      name: "a".repeat(100),
    };
    const shortToolName = "tool";
    const result = getPrefixedToolName(longServerConfig, shortToolName);
    expect(result.isOk()).toBe(true);
    assert(result.isOk());
    const expectedServerNameLength =
      64 - shortToolName.length - TOOL_NAME_SEPARATOR.length;
    expect(result.value).toBe(
      `a`.repeat(expectedServerNameLength) + TOOL_NAME_SEPARATOR + shortToolName
    );
  });

  it("should handle minimum prefix length requirement", () => {
    const shortServerConfig: ServerSideMCPServerConfigurationType = {
      ...mockConfig,
      name: "ab",
    };
    const longToolName = "a".repeat(60);
    const result = getPrefixedToolName(shortServerConfig, longToolName);
    expect(result.isOk()).toBe(true);
    assert(result.isOk());
    expect(result.value).toBe("a".repeat(60));
  });
});
