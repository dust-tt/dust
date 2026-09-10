import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { isDustWebsearchTool } from "@app/lib/actions/utils";
import { describe, expect, it } from "vitest";

function makeTool({
  originalName,
  serverName,
}: {
  originalName: string;
  serverName: InternalMCPServerNameType | null;
}): MCPToolConfigurationType {
  return {
    id: -1,
    sId: `tool_${originalName}`,
    type: "mcp_configuration",
    // The name the model sees is prefixed and can be disambiguated by space, so
    // the predicate must not rely on it.
    name: `some_prefix__${originalName}`,
    description: `Description of ${originalName}`,
    inputSchema: { type: "object", properties: {}, required: [] },
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: "view_1",
    dustAppConfiguration: null,
    secretName: null,
    dustProject: null,
    internalMCPServerId:
      serverName === null
        ? null
        : internalMCPServerNameToSId({
            name: serverName,
            workspaceId: 1,
            prefix: 0,
          }),
    originalName,
    mcpServerName: "server",
    availability: "auto",
    permission: "never_ask",
    toolServerId: "server_id",
    retryPolicy: "no_retry",
  };
}

describe("isDustWebsearchTool", () => {
  // The same two tools are registered on both internal servers, so both
  // mountings have to be recognized.
  it("matches websearch on both servers that mount it", () => {
    for (const serverName of ["web_search_&_browse", "http_client"] as const) {
      expect(
        isDustWebsearchTool(makeTool({ originalName: "websearch", serverName }))
      ).toBe(true);
    }
  });

  // The provider's native search returns snippets only, so reading a full page
  // still goes through Dust's browser.
  it("does not match webbrowser", () => {
    expect(
      isDustWebsearchTool(
        makeTool({
          originalName: "webbrowser",
          serverName: "web_search_&_browse",
        })
      )
    ).toBe(false);
  });

  it("does not match a same-named tool from another internal server", () => {
    expect(
      isDustWebsearchTool(
        makeTool({ originalName: "websearch", serverName: "search" })
      )
    ).toBe(false);
  });

  it("does not match a same-named tool from a remote server", () => {
    expect(
      isDustWebsearchTool(
        makeTool({ originalName: "websearch", serverName: null })
      )
    ).toBe(false);
  });
});
