import type { SkillConfigurationModel } from "@app/lib/models/skill";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { SkillStatus } from "@app/types/skill_configuration";

// Constrained find options include both global and custom skills.
export type AllSkillConfigurationFindOptions = Omit<
  ResourceFindOptions<SkillConfigurationModel>,
  "limit" | "offset" | "where"
> & {
  where?: {
    name?: string;
    sId?: string;
    status?: SkillStatus;
  };
  onlyCustom?: false; // Default: include global skills.
};

// Full find options only custom skills from database.
type CustomSkillConfigurationFindOptions =
  ResourceFindOptions<SkillConfigurationModel> & {
    onlyCustom: true; // Explicit: only custom skills.
  };

export type SkillConfigurationFindOptions =
  | AllSkillConfigurationFindOptions
  | CustomSkillConfigurationFindOptions;
