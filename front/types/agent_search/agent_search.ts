import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";

export interface AgentSearchDocument extends ElasticsearchBaseDocument {
  agent_id: string;
  agent_model_id: ModelId;
  status: "active";
  availability: "workspace_users" | "editors";
  name: string;
  description: string;
  icon: string;
  edited_by: ModelId;
  editor_user_ids: ModelId[];
  requested_space_ids: string[];
  tools: string[];
  tags: string[];
  skills: string[];
  active_users: number;
  favorite_count: number;
  feedbacks: number;
  updated_at: string;
  // Source-only fields needed to reuse the existing light serialization, never the prompt/tools.
  metadata: Pick<
    LightAgentConfigurationType,
    | "id"
    | "version"
    | "versionCreatedAt"
    | "model"
    | "maxStepsPerRun"
    | "templateId"
    | "tags"
    | "reinforcement"
    | "lastReinforcementAnalysisAt"
  >;
}
