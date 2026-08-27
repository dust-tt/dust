import type { MCPServerViewType } from "@app/lib/api/mcp";
import { describe, expect, it } from "vitest";
import type {
  SlashCommandSkillSuggestion,
  SlashCommandToolSuggestion,
} from "./SlashCommandCapabilitiesItems";
import {
  getSkillSlashCommandItem,
  getToolSlashCommandItem,
  MAX_RENDERED_CAPABILITY_ITEMS,
  matchesSlashCommandCapabilityQuery,
  searchCapabilityIndex,
} from "./SlashCommandCapabilitiesItems";
import { buildCapabilitySlashCommandItems } from "./slash_suggestion/buildSlashCommandItems";

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
}): SlashCommandToolSuggestion<MCPServerViewType> {
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
    isRestrictedToSkills: false,
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

describe("searchCapabilityIndex ranking", () => {
  it("sorts capabilities alphabetically when no query is provided", () => {
    const result = searchCapabilityIndex({
      items: [
        { id: "z", sortName: "zendesk" },
        { id: "a", sortName: "asana" },
      ],
      query: "",
    });

    expect(result.map((item) => item.id)).toEqual(["a", "z"]);
  });

  it("ranks favorite capabilities first when no query is provided", () => {
    const result = searchCapabilityIndex({
      query: "",
      items: [
        { id: "a", sortName: "asana" },
        { id: "z", isFavorite: true, sortName: "zendesk" },
      ],
    });

    expect(result.map((item) => item.id)).toEqual(["z", "a"]);
  });

  it("ranks earlier substring matches first", () => {
    const result = searchCapabilityIndex({
      items: [
        { id: "later", sortName: "create detailed guide" },
        { id: "earlier", sortName: "create guide" },
      ],
      query: "guide",
    });

    expect(result.map((item) => item.id)).toEqual(["earlier", "later"]);
  });

  it("normalizes query whitespace and casing before ranking", () => {
    const result = searchCapabilityIndex({
      items: [
        { id: "prefix", sortName: "guide builder" },
        { id: "exact", sortName: "guide" },
      ],
      query: "  GUIDE  ",
    });

    expect(result.map((item) => item.id)).toEqual(["exact", "prefix"]);
  });

  it("ranks matches before applying the result limit", () => {
    const result = searchCapabilityIndex({
      items: [
        {
          id: "fuzzy",
          sortName: "generate useful insights for data export",
        },
        { id: "substring", sortName: "create guide" },
        { id: "prefix", sortName: "guide builder" },
        { id: "exact", sortName: "guide" },
      ],
      limit: 2,
      query: "guide",
    });

    expect(result.map((item) => item.id)).toEqual(["exact", "prefix"]);
  });

  it("does not mutate the search index", () => {
    const items = [
      { id: "substring", sortName: "create guide" },
      { id: "exact", sortName: "guide" },
    ];

    searchCapabilityIndex({ items, query: "guide" });

    expect(items.map((item) => item.id)).toEqual(["substring", "exact"]);
  });

  it("ranks title prefix matches above other fuzzy title matches", () => {
    const result = searchCapabilityIndex({
      items: [
        { id: "contains", sortName: "create guide" },
        { id: "prefix", sortName: "guide builder" },
      ],
      query: "guide",
    });

    expect(result.map((item) => item.id)).toEqual(["prefix", "contains"]);
  });

  it("ranks title matches above description-only matches", () => {
    const result = searchCapabilityIndex({
      items: [
        {
          id: "desc-only",
          normalizedDescription: "search and retrieve docs",
          sortName: "linear",
        },
        {
          id: "title-match",
          normalizedDescription: "view files",
          sortName: "docs viewer",
        },
      ],
      query: "docs",
    });

    expect(result.map((item) => item.id)).toEqual(["title-match", "desc-only"]);
  });

  it("ranks favorites first within the same query match class", () => {
    const result = searchCapabilityIndex({
      query: "docs",
      items: [
        {
          id: "non-favorite",
          sortName: "docs assistant",
        },
        {
          id: "favorite",
          sortName: "docs writer",
          isFavorite: true,
        },
      ],
    });

    expect(result.map((item) => item.id)).toEqual(["favorite", "non-favorite"]);
  });

  it("allows exact aliases to rank normally", () => {
    const result = searchCapabilityIndex({
      items: [
        {
          id: "prefix",
          sortName: "Deep Dive Assistant",
        },
        {
          id: "alias",
          searchAliases: ["Detailed Research", "Deep Dive"],
          sortName: "Go Deep",
        },
      ],
      query: "deep dive",
    });

    expect(result.map((item) => item.id)).toEqual(["alias", "prefix"]);
  });

  it("ranks partial alias matches below canonical names when favorite", () => {
    const result = searchCapabilityIndex({
      items: [
        {
          id: "canonical-fuzzy",
          sortName: "Search And Navigate Data",
        },
        {
          id: "alias",
          isFavorite: true,
          searchAliases: ["Sandbox"],
          sortName: "Computer",
        },
      ],
      query: "sand",
    });

    expect(result.map((item) => item.id)).toEqual(["canonical-fuzzy", "alias"]);
  });
});

describe("searchCapabilityIndex", () => {
  it("returns only the first ranked result window", () => {
    const result = searchCapabilityIndex({
      items: Array.from(
        { length: MAX_RENDERED_CAPABILITY_ITEMS + 10 },
        (_, index) => ({
          id: index,
          sortName: `capability ${index.toString().padStart(2, "0")}`,
        })
      ),
      query: "",
    });

    expect(result).toHaveLength(MAX_RENDERED_CAPABILITY_ITEMS);
    expect(result[0]?.id).toBe(0);
    expect(result.at(-1)?.id).toBe(MAX_RENDERED_CAPABILITY_ITEMS - 1);
  });

  it("searches normalized descriptions and preserves group ordering", () => {
    const result = searchCapabilityIndex({
      items: [
        {
          id: "uninstalled-title-match",
          normalizedDescription: "create an issue",
          sortGroup: 1,
          sortName: "linear docs",
        },
        {
          id: "installed-description-match",
          normalizedDescription: "search docs",
          sortName: "search",
        },
      ],
      query: "docs",
    });

    expect(result.map((item) => item.id)).toEqual([
      "installed-description-match",
      "uninstalled-title-match",
    ]);
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
      tooltip: { description: "Create memo" },
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

describe("buildCapabilitySlashCommandItems", () => {
  it("matches a global skill by its configured search aliases", () => {
    const goDeep = skillSuggestion({
      name: "Go Deep",
      sId: "go-deep",
    });
    const deepDiveAssistant = skillSuggestion({
      name: "Deep Dive Assistant",
      sId: "skl_deep_dive_assistant",
    });

    const result = buildCapabilitySlashCommandItems({
      query: "Deep Dive",
      skills: [deepDiveAssistant, goDeep],
      tools: [],
    });

    expect(result.map((item) => item.id)).toEqual([
      "go-deep",
      "skl_deep_dive_assistant",
    ]);
  });
});
