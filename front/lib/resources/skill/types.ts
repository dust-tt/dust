import type { SkillConfigurationModel } from "@app/lib/models/skill";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type {
  SkillAvailability,
  SkillStatus,
} from "@app/types/assistant/skill_configuration";

// Constrained find options include both global and custom skills.
export type AllSkillConfigurationFindOptions = Omit<
  ResourceFindOptions<SkillConfigurationModel>,
  "limit" | "offset" | "where"
> & {
  where?: {
    name?: string | string[];
    sId?: string | string[];
    id?: number | number[];
    status?: SkillStatus | SkillStatus[];
    availability?: SkillAvailability | SkillAvailability[];
  };
  onlyCustom?: false; // Default: include global skills.
};

// Full find options only custom skills from database.
type CustomSkillConfigurationFindOptions =
  ResourceFindOptions<SkillConfigurationModel> & {
    onlyCustom: true; // Explicit: only custom skills.
  };

// baseFetch controls the selected model attributes based on hydration options
// such as withInstructions.
export type SkillConfigurationFindOptions = (
  | Omit<AllSkillConfigurationFindOptions, "attributes">
  | Omit<CustomSkillConfigurationFindOptions, "attributes">
) & {
  withTools?: boolean;
  withToolMetadata?: boolean;
  withInstructions?: boolean;
  withFileAttachments?: boolean;
};
