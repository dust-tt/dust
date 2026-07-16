import type { SkillConfigurationModel } from "@app/lib/models/skill";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";

type SkillResourceFindOptions = Omit<
  ResourceFindOptions<SkillConfigurationModel>,
  "attributes"
>;

// Constrained find options include both global and custom skills.
export type AllSkillConfigurationFindOptions = Omit<
  SkillResourceFindOptions,
  "limit" | "offset" | "where"
> & {
  where?: {
    name?: string | string[];
    sId?: string | string[];
    id?: number | number[];
    status?: SkillStatus | SkillStatus[];
    isDefault?: boolean;
  };
  onlyCustom?: false; // Default: include global skills.
  withTools?: boolean;
  withInstructions?: boolean;
  withFileAttachments?: boolean;
};

// Full find options only custom skills from database.
type CustomSkillConfigurationFindOptions = SkillResourceFindOptions & {
  onlyCustom: true; // Explicit: only custom skills.
  withTools?: boolean;
  withInstructions?: boolean;
  withFileAttachments?: boolean;
};

export type SkillConfigurationFindOptions =
  | AllSkillConfigurationFindOptions
  | CustomSkillConfigurationFindOptions;
