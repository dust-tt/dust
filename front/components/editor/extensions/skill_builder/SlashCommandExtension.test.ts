import type { SlashCommandSkillSuggestion } from "@app/components/editor/extensions/shared/SlashCommandSkillItems";
import type { SlashCommandToolSuggestion } from "@app/components/editor/extensions/shared/SlashCommandToolItems";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { describe, expect, it } from "vitest";

import type { SlashCommand } from "./SlashCommandDropdown";
import { buildSkillBuilderSlashCommandItems } from "./SlashCommandExtension";

const attachKnowledgeItem: SlashCommand = {
  action: "insert-knowledge-node",
  icon: () => null,
  id: "add-knowledge",
  label: "Attach knowledge",
};

const skillSuggestion = ({
  icon = null,
  userFacingDescription = "",
  visibility = "published",
  ...skill
}: Pick<SlashCommandSkillSuggestion, "name" | "sId"> &
  Partial<SlashCommandSkillSuggestion>): SlashCommandSkillSuggestion => ({
  icon,
  userFacingDescription,
  visibility,
  ...skill,
});

const toolSuggestion = ({
  description = "Search data.",
  label,
  name = "search",
  serverIcon = "ActionMagnifyingGlassIcon",
  serverName = "search",
  sId,
}: {
  description?: string | null;
  label?: string;
  name?: string | null;
  serverIcon?: MCPServerViewType["server"]["icon"];
  serverName?: string;
  sId: string;
}): SlashCommandToolSuggestion => ({
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
    description: "Search workspace data.",
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
});

describe("buildSkillBuilderSlashCommandItems", () => {
  it("keeps the existing command when skill suggestions are disabled", () => {
    const result = buildSkillBuilderSlashCommandItems({
      baseItems: [attachKnowledgeItem],
      includeSkillSuggestions: false,
      query: "",
      skills: [
        skillSuggestion({
          name: "Create memo",
          sId: "skill_create_memo",
        }),
      ],
    });

    expect(result).toEqual([attachKnowledgeItem]);
  });

  it("adds filtered skills under the capabilities section", () => {
    const result = buildSkillBuilderSlashCommandItems({
      baseItems: [attachKnowledgeItem],
      currentSkillId: "skill_current",
      includeSkillSuggestions: true,
      query: "memo",
      skills: [
        skillSuggestion({
          name: "Create memo",
          sId: "skill_create_memo",
          userFacingDescription: "Draft structured memos.",
        }),
        skillSuggestion({
          name: "Issue triage",
          sId: "skill_issue_triage",
        }),
        skillSuggestion({
          name: "Current skill",
          sId: "skill_current",
        }),
      ],
    });

    expect(result.map((item) => item.id)).toEqual([
      "add-knowledge",
      "skill_create_memo",
    ]);
    expect(result[1]).toMatchObject({
      action: "select-skill",
      data: {
        skill: {
          icon: null,
          id: "skill_create_memo",
          name: "Create memo",
        },
      },
      description: "Draft structured memos.",
      sectionLabel: "Capabilities",
    });
  });

  it("sorts filtered skills and tools together", () => {
    const tool = toolSuggestion({
      label: "Alpha search",
      name: null,
      sId: "mcp_server_view_search",
    });

    const result = buildSkillBuilderSlashCommandItems({
      baseItems: [attachKnowledgeItem],
      includeSkillSuggestions: true,
      query: "",
      skills: [
        skillSuggestion({
          name: "Search checklist",
          sId: "skill_search_checklist",
        }),
      ],
      tools: [tool],
    });

    expect(result.map((item) => item.id)).toEqual([
      "add-knowledge",
      "mcp_server_view_search",
      "skill_search_checklist",
    ]);
    expect(result[1]?.sectionLabel).toBe("Capabilities");
    expect(result[2]?.sectionLabel).toBeUndefined();
    expect(result[1]).toMatchObject({
      action: "select-tool",
      data: {
        tool: {
          id: "mcp_server_view_search",
          name: "Alpha search",
          view: tool,
        },
      },
    });
  });

  it("does not include unpublished skills", () => {
    const result = buildSkillBuilderSlashCommandItems({
      baseItems: [attachKnowledgeItem],
      includeSkillSuggestions: true,
      query: "",
      skills: [
        skillSuggestion({
          name: "Published skill",
          sId: "skill_published",
          visibility: "published",
        }),
        skillSuggestion({
          name: "Unpublished skill",
          sId: "skill_unpublished",
          visibility: "unpublished",
        }),
      ],
    });

    expect(result.map((item) => item.id)).toEqual([
      "add-knowledge",
      "skill_published",
    ]);
  });

  it("labels the first tool section when there are no matching skills", () => {
    const result = buildSkillBuilderSlashCommandItems({
      baseItems: [],
      includeSkillSuggestions: true,
      query: "search",
      skills: [],
      tools: [
        toolSuggestion({
          label: "Search docs",
          name: null,
          sId: "mcp_server_view_search",
        }),
      ],
    });

    expect(result[0]).toMatchObject({
      id: "mcp_server_view_search",
      sectionLabel: "Capabilities",
    });
  });
});
