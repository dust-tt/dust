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
  description: string | null;
  icon: string | null;
  last_edited_by_user_id: string | null;
  editor_ids: string[];
  requested_space_ids: string[];
  mcp_server_view_ids: string[];
  active_users_count: number;
  favorite_count: number;
  created_at: string;
  updated_at: string;
}
