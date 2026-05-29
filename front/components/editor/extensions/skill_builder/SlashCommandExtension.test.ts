import type { SlashCommandSkillSuggestion } from "@app/components/editor/extensions/shared/SlashCommandSkillItems";
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
  ...skill
}: Pick<SlashCommandSkillSuggestion, "name" | "sId"> &
  Partial<SlashCommandSkillSuggestion>): SlashCommandSkillSuggestion => ({
  icon,
  userFacingDescription,
  ...skill,
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
});
