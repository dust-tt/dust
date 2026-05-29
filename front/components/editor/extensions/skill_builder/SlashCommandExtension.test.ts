import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import { describe, expect, it } from "vitest";

import type { SlashCommand } from "./SlashCommandDropdown";
import { buildSkillBuilderSlashCommandItems } from "./SlashCommandExtension";

const attachKnowledgeItem: SlashCommand = {
  action: "insert-knowledge-node",
  icon: () => null,
  id: "add-knowledge",
  label: "Attach knowledge",
};

function makeSkill({
  name,
  sId,
  ...overrides
}: Pick<SkillWithoutInstructionsAndToolsType, "name" | "sId"> &
  Partial<SkillWithoutInstructionsAndToolsType>): SkillWithoutInstructionsAndToolsType {
  return {
    agentFacingDescription: "",
    canWrite: true,
    createdAt: null,
    editedBy: null,
    extendedSkillId: null,
    fileAttachments: [],
    icon: null,
    id: 1,
    isDefault: false,
    isExtendable: true,
    lastReinforcementAnalysisAt: null,
    name,
    reinforcement: "off",
    requestedSpaceIds: [],
    selfImprovementCostsCapMicroUsd: null,
    selfImprovementLock: false,
    sId,
    source: null,
    sourceMetadata: null,
    status: "active",
    updatedAt: null,
    userFacingDescription: "",
    ...overrides,
  };
}

describe("buildSkillBuilderSlashCommandItems", () => {
  it("keeps the existing command when skill suggestions are disabled", () => {
    const result = buildSkillBuilderSlashCommandItems({
      baseItems: [attachKnowledgeItem],
      includeSkills: false,
      query: "",
      skills: [
        makeSkill({
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
      includeSkills: true,
      query: "memo",
      skills: [
        makeSkill({
          name: "Create memo",
          sId: "skill_create_memo",
          userFacingDescription: "Draft structured memos.",
        }),
        makeSkill({
          name: "Issue triage",
          sId: "skill_issue_triage",
        }),
        makeSkill({
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
