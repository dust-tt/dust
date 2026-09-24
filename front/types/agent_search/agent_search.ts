import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type {
  AgentConfigurationScope,
  AgentConfigurationStatus,
} from "@app/types/assistant/agent";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";

export interface AgentSearchDocumentModel {
  provider_id: ModelProviderIdType;
  model_id: ModelIdType;
  reasoning_effort: ReasoningEffort;
}

export interface AgentSearchDocument extends ElasticsearchBaseDocument {
  agent_id: string;
  status: AgentConfigurationStatus;
  scope: AgentConfigurationScope;
  model: AgentSearchDocumentModel | null;
  name: string;
  picture_url: string;
  last_edited_by_user_id: string | null;
  requested_space_ids: string[];
  created_at: string | null;
  updated_at: string | null;
  description: string;
  skill_ids: string[];
  mcp_server_view_ids: string[];
  tag_ids: string[];
  feedback_positive_count: number;
  feedback_negative_count: number;
  active_users_count: number | null;
  favorite_count: number;
  editor_ids: string[];
}
