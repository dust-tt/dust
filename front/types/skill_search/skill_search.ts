import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type {
  SkillAvailability,
  SkillStatus,
} from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";

export interface SkillSearchDocument extends ElasticsearchBaseDocument {
  skill_id: string;
  status: SkillStatus;
  availability: SkillAvailability;
  name: string;
  user_facing_description: string | null;
  icon: string | null;
  edited_by: number | null;
  editor_user_ids: ModelId[];
  requested_space_ids: string[];
  non_pod_space_ids: string[];
  non_pod_space_count: number;
  pod_space_id: string | null;
  updated_at: string;
}
