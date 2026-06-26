import type { MCPServerViewType } from "@app/lib/api/mcp";
import { describe, expect, it } from "vitest";

import {
  getSkillSlashCommandItem,
  getToolSlashCommandItem,
  matchesSlashCommandCapabilityQuery,
  type SlashCommandSkillSuggestion,
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

function skillSuggestion({
  editedBy = 1,
  icon = null,
  requestedSpaceIds = [],
  sId,
  userFacingDescription = "Draft structured memos.",
  name,
}: Pick<SlashCommandSkillSuggestion, "name" | "sId"> &
  Partial<SlashCommandSkillSuggestion>): SlashCommandSkillSuggestion {
  return {
    editedBy,
    icon,
    name,
    requestedSpaceIds,
    sId,
    userFacingDescription,
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

  it("matches against description when label does not match", () => {
    expect(
      matchesSlashCommandCapabilityQuery({
        description: "Search and retrieve documents",
        label: "Linear",
        query: "docs",
      })
    ).toBe(true);
  });

  it("does not match against description when description is absent", () => {
    expect(
      matchesSlashCommandCapabilityQuery({
        label: "Linear",
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

  it("ranks title matches above description-only matches", () => {
    const result = sortSlashCommandCapabilityMatches({
      normalizedQuery: "docs",
      items: [
        {
          id: "desc-only",
          sortName: "linear",
          description: "Search and retrieve docs",
        },
        {
          id: "title-match",
          sortName: "docs viewer",
          description: "View files",
        },
      ],
    });

    expect(result.map((item) => item.id)).toEqual(["title-match", "desc-only"]);
  });
});

describe("getSkillSlashCommandItem", () => {
  it("builds a slash command item that keeps the selected skill", () => {
    const skill = skillSuggestion({
      name: "Create memo",
      sId: "skill_create_memo",
      userFacingDescription: "Draft structured memos.",
    });

    const item = getSkillSlashCommandItem(skill);

    expect(item).toMatchObject({
      action: "select-skill",
      data: {
        skill,
      },
      description: "Draft structured memos.",
      hasDetails: true,
      id: "skill_create_memo",
      label: "Create memo",
    });
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

    const item = getToolSlashCommandItem(tool);

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
      hasDetails: true,
      id: "mcp_server_view_linear",
      label: "Create ticket (Product)",
    });
  });
});
