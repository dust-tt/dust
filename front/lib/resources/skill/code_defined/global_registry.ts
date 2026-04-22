import type { Authenticator } from "@app/lib/auth";
import { framesSkill } from "@app/lib/resources/skill/code_defined/frames";
import { goDeepSkill } from "@app/lib/resources/skill/code_defined/go_deep";
import { mentionUsersSkill } from "@app/lib/resources/skill/code_defined/mention_users";
import { projectsSkill } from "@app/lib/resources/skill/code_defined/projects";
import {
  ensureUniqueSIds,
  filterSkillDefinitions,
  type GlobalSkillDefinition,
} from "@app/lib/resources/skill/code_defined/shared";
import type { AllSkillConfigurationFindOptions } from "@app/lib/resources/skill/types";

const GLOBAL_SKILLS_ARRAY = ensureUniqueSIds([
  framesSkill,
  goDeepSkill,
  mentionUsersSkill,
  projectsSkill,
] as const);

const GLOBAL_SKILLS_BY_ID: Map<string, GlobalSkillDefinition> = new Map(
  GLOBAL_SKILLS_ARRAY.map((skill) => [skill.sId, skill])
);

export type GlobalSkillId = (typeof GLOBAL_SKILLS_ARRAY)[number]["sId"];

export class GlobalSkillsRegistry {
  private static getByIdInternal(
    sId: string
  ): GlobalSkillDefinition | undefined {
    return GLOBAL_SKILLS_BY_ID.get(sId);
  }

  static async getById(
    auth: Authenticator,
    sId: string
  ): Promise<GlobalSkillDefinition | null> {
    const skills = await this.findAll(auth, { sId });

    return skills[0] ?? null;
  }

  static async findAll(
    auth: Authenticator,
    where: AllSkillConfigurationFindOptions["where"] = {}
  ): Promise<GlobalSkillDefinition[]> {
    return filterSkillDefinitions(auth, GLOBAL_SKILLS_ARRAY, where, {
      isDefault: true,
    });
  }

  static doesSkillInheritAgentConfigurationDataSources(sId: string): boolean {
    return (
      this.getByIdInternal(sId)?.inheritAgentConfigurationDataSources ?? false
    );
  }
}
