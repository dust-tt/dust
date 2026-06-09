import type { MCPServerViewType } from "@app/lib/api/mcp";
import { describe, expect, it } from "vitest";

import {
  getToolSlashCommandItem,
  matchesSlashCommandCapabilityQuery,
  type SlashCommandToolSuggestion,
  sortSlashCommandCapabilityMatches,
} from "./SlashCommandCapabilitiesItems";

function toolSuggestion({
  description = "Search data.",
  label,
  name = "search",
  serverDescription = "Search workspace data.",
  serverIcon = "ActionMagnifyingGlassIcon",
  serverName = "search",
  sId,
}: {
  description?: string | null;
  label?: string;
  name?: string | null;
  serverDescription?: string;
  serverIcon?: MCPServerViewType["server"]["icon"];
  serverName?: string;
  sId: string;
}): SlashCommandToolSuggestion {
  return {
    id: 1,
    sId,
    name,
    description,
    createdAt: 0,
    updatedAt: 0,
    spaceId: "space_1",
    serverType: "internal",
    server: {
      name: serverName,
      version: "1.0.0",
      description: serverDescription,
      sId: `mcp_server_${serverName}`,
      icon: serverIcon,
      authorization: null,
      tools: [],
      availability: "manual",
      allowMultipleInstances: false,
      documentationUrl: null,
    },
    oAuthUseCase: null,
    editedByUser: null,
    label,
  };
}

describe("matchesSlashCommandCapabilityQuery", () => {
  it("matches capability labels with fuzzy slash query matching", () => {
    expect(
      matchesSlashCommandCapabilityQuery({
        label: "Search docs",
        query: "docs",
      })
    ).toBe(true);
    expect(
      matchesSlashCommandCapabilityQuery({
        label: "Create ticket",
        query: "docs",
      })
    ).toBe(false);
  });
});

describe("sortSlashCommandCapabilityMatches", () => {
  it("sorts capabilities alphabetically when no query is provided", () => {
    const result = sortSlashCommandCapabilityMatches({
      normalizedQuery: "",
      items: [
        { id: "z", sortName: "zendesk" },
        { id: "a", sortName: "asana" },
      ],
    });

    expect(result.map((item) => item.id)).toEqual(["a", "z"]);
  });

  it("breaks fuzzy ties alphabetically when a query is provided", () => {
    const result = sortSlashCommandCapabilityMatches({
      normalizedQuery: "test",
      items: [
        { id: "testlonger", sortName: "testlonger" },
        { id: "longtest", sortName: "longtest" },
      ],
    });

    expect(result.map((item) => item.id)).toEqual(["longtest", "testlonger"]);
  });
});

describe("getToolSlashCommandItem", () => {
  it("builds a slash command item that keeps the selected MCP server view", () => {
    const tool = toolSuggestion({
      description: "Draft a ticket.",
      label: "Create ticket (Product)",
      name: "Create ticket",
      serverIcon: "ActionListIcon",
      serverName: "linear",
      sId: "mcp_server_view_linear",
    });

    const item = getToolSlashCommandItem(tool, {
      sectionLabel: "Capabilities",
    });

    expect(item).toMatchObject({
      action: "select-tool",
      data: {
        tool: {
          icon: "ActionListIcon",
          id: "mcp_server_view_linear",
          name: "Create ticket (Product)",
          view: tool,
        },
      },
      description: "Draft a ticket.",
      id: "mcp_server_view_linear",
      label: "Create ticket (Product)",
      sectionLabel: "Capabilities",
      tooltip: {
        description: "Draft a ticket.",
      },
    });
  });
});
