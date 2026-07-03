import type { SkillConfigurationModel } from "@app/lib/models/skill";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";

// Fields identifying a skill in related tables (e.g., AgentSkillModel,
// ConversationSkillModel).
export type SkillReferenceFields =
  | { globalSkillId: string }
  | { customSkillId: ModelId };

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
    isDefault?: boolean;
  };
  onlyCustom?: false; // Default: include global skills.
  withTools?: boolean;
  withInstructions?: boolean;
};

// Full find options only custom skills from database.
type CustomSkillConfigurationFindOptions =
  ResourceFindOptions<SkillConfigurationModel> & {
    onlyCustom: true; // Explicit: only custom skills.
    withTools?: boolean;
    withInstructions?: boolean;
  };

export type SkillConfigurationFindOptions =
  | AllSkillConfigurationFindOptions
  | CustomSkillConfigurationFindOptions;
