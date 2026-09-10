import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type {
  SkillAvailability,
  SkillStatus,
} from "@app/types/assistant/skill_configuration";
import { SkillWithoutInstructionsAndToolsSchema } from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import { z } from "zod";

export const SkillSearchMetadataSchema =
  SkillWithoutInstructionsAndToolsSchema.pick({
    agentFacingDescription: true,
    source: true,
    sourceMetadata: true,
    reinforcement: true,
    selfImprovementLock: true,
    selfImprovementCostsCapMicroUsd: true,
    selfImprovementCostsCapAwuCredits: true,
    manuallyRequestedSpaceIds: true,
  }).extend({
    createdAt: z.number().finite(),
    lastReinforcementAnalysisAt: z.string().datetime().nullable().optional(),
  });

export interface SkillSearchDocument extends ElasticsearchBaseDocument {
  skill_id: string;
  status: SkillStatus;
  availability: SkillAvailability;
  name: string;
  description: string | null;
  icon: string | null;
  edited_by: number | null;
  editors: ModelId[];
  // Optional while existing documents receive the additive editor-group backfill.
  editor_group_ids?: ModelId[];
  requested_space_ids: string[];
  tools: string[];
  active_users: number;
  favorite_count: number;
  is_default: boolean;
  updated_at: string;
  // Source-only fields for the existing stripped SkillResource serialization.
  metadata: z.infer<typeof SkillSearchMetadataSchema>;
}
