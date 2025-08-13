import { assert, describe, expect, it } from "vitest";

import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import {
  getPrefixedToolName,
  makeToolsWithStakesAndTimeout,
  TOOL_NAME_SEPARATOR,
} from "@app/lib/actions/mcp_actions";
import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";

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

  it("should correctly prefix and slugify tool names with special characters", () => {
    const result = getPrefixedToolName(mockConfig, "My Tool (123) $");
    expect(result.isOk()).toBe(true);
    assert(result.isOk());
    expect(result.value).toBe(`test_server${TOOL_NAME_SEPARATOR}my_tool_123_`);
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

describe("makeToolsWithStakesAndTimeout", () => {
  it("should process internal MCP server with google_calendar", () => {
    const metadata: {
      toolName: string;
      permission: "high" | "low" | "never_ask";
      enabled: boolean;
    }[] = [
      {
        toolName: "list_calendars",
        permission: "high",
        enabled: true,
      },
    ];

    const sid = internalMCPServerNameToSId({
      name: "google_calendar",
      workspaceId: 1,
      prefix: 0,
    });
    const result = makeToolsWithStakesAndTimeout(sid, metadata);
    assert(result.isOk());
    expect(result.value).toEqual({
      toolsEnabled: {
        list_calendars: true,
      },
      toolsStakes: {
        list_calendars: "never_ask",
        list_events: "never_ask",
        get_event: "never_ask",
        create_event: "low",
        update_event: "low",
        delete_event: "low",
        check_availability: "never_ask",
      },
      serverTimeoutMs: undefined,
    });
  });

  it("should process remote MCP server", () => {
    const metadata: {
      toolName: string;
      permission: "high" | "low" | "never_ask";
      enabled: boolean;
    }[] = [
      {
        toolName: "custom_tool",
        permission: "low",
        enabled: true,
      },
      {
        toolName: "another_tool",
        permission: "high",
        enabled: true,
      },
      {
        toolName: "yet_another_tool",
        permission: "low",
        enabled: false,
      },
    ];

    const result = makeToolsWithStakesAndTimeout("rms_DzP3svIoVg", metadata);
    assert(result.isOk());
    expect(result.value).toEqual({
      toolsEnabled: {
        custom_tool: true,
        another_tool: true,
        yet_another_tool: false,
      },
      toolsStakes: {
        custom_tool: "low",
        another_tool: "high",
        yet_another_tool: "low",
      },
      serverTimeoutMs: undefined,
    });
  });

  it("should handle errors from invalid server ID format", () => {
    // Use an invalid server ID format that will cause an error to be thrown
    const metadata: RemoteMCPServerToolMetadataResource[] = [];

    expect(() => {
      makeToolsWithStakesAndTimeout("invalid_server_id", metadata);
    }).toThrow("Invalid MCP server ID: invalid_server_id");
  });
});
