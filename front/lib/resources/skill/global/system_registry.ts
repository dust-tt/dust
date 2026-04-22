import type { Authenticator } from "@app/lib/auth";
import { discoverKnowledgeSkill } from "@app/lib/resources/skill/global/discover_knowledge";
import { discoverSkillsSkill } from "@app/lib/resources/skill/global/discover_skills";
import { discoverToolsSkill } from "@app/lib/resources/skill/global/discover_tools";
import { sandboxSkill } from "@app/lib/resources/skill/global/sandbox";
import {
  ensureUniqueSIds,
  filterSkillDefinitions,
  type SystemSkillDefinition,
} from "@app/lib/resources/skill/global/shared";
import type { AllSkillConfigurationFindOptions } from "@app/lib/resources/skill/types";

const SYSTEM_SKILLS_ARRAY = ensureUniqueSIds([
  discoverKnowledgeSkill,
  discoverSkillsSkill,
  discoverToolsSkill,
  sandboxSkill,
] as const);

const SYSTEM_SKILLS_BY_ID: Map<string, SystemSkillDefinition> = new Map(
  SYSTEM_SKILLS_ARRAY.map((skill) => [skill.sId, skill])
);

export type SystemSkillId = (typeof SYSTEM_SKILLS_ARRAY)[number]["sId"];

export class SystemSkillsRegistry {
  private static getByIdInternal(
    sId: string
  ): SystemSkillDefinition | undefined {
    return SYSTEM_SKILLS_BY_ID.get(sId);
  }

  static async getById(
    auth: Authenticator,
    sId: string
  ): Promise<SystemSkillDefinition | null> {
    const skills = await this.findAll(auth, { sId });

    return skills[0] ?? null;
  }

  static async findAll(
    auth: Authenticator,
    where: AllSkillConfigurationFindOptions["where"] = {}
  ): Promise<SystemSkillDefinition[]> {
    return filterSkillDefinitions(auth, SYSTEM_SKILLS_ARRAY, where, {
      isDefault: false,
    });
  }

  static isSystemSkill(sId: string): boolean {
    return this.getByIdInternal(sId) !== undefined;
  }

  static doesSkillInheritAgentConfigurationDataSources(sId: string): boolean {
    return (
      this.getByIdInternal(sId)?.inheritAgentConfigurationDataSources ?? false
    );
  }
}
