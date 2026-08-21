import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type {
  SkillAvailability,
  SkillStatus,
} from "@app/types/assistant/skill_configuration";

export interface SkillSearchDocument extends ElasticsearchBaseDocument {
  skill_id: string;
  status: SkillStatus;
  availability: SkillAvailability;
  name: string;
  user_facing_description: string | null;
  agent_facing_description: string;
  icon: string | null;
  edited_by: number | null;
  editor_group_id: string;
  requested_space_ids: string[];
  non_pod_space_ids: string[];
  non_pod_space_count: number;
  pod_space_id: string | null;
  created_at: string;
  updated_at: string;
}
