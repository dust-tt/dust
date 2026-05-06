import type { ConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import type { ModelId } from "@app/types/shared/model_id";

export const PROJECT_TASK_STATUSES = ["todo", "in_progress", "done"] as const;

export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number];

export const PROJECT_TASK_ACTOR_TYPES = ["user", "agent"] as const;

export type ProjectTaskActorType = (typeof PROJECT_TASK_ACTOR_TYPES)[number];

export const PROJECT_TASK_SOURCE_TYPES = [
  "project_conversation",
  "project_knowledge",
  "slack",
  "notion",
  "gdrive",
  "confluence",
  "github",
  "microsoft",
] as const;

export type ProjectTaskSourceType = (typeof PROJECT_TASK_SOURCE_TYPES)[number];

export const AGENT_SUGGESTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type AgentSuggestionStatus = (typeof AGENT_SUGGESTION_STATUSES)[number];

export type ProjectTaskSourceInfo = {
  sourceType: ProjectTaskSourceType;
  sourceId: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
};

export type ProjectTaskAssigneeType = {
  sId: string;
  fullName: string;
  image: string | null;
};

export type ProjectTaskType = {
  id: ModelId;
  sId: string;
  user: ProjectTaskAssigneeType | null;
  conversationId: string | null;
  /** Same semantics as the left sidebar conversation row (see `getConversationDotStatus`). */
  conversationSidebarStatus: ConversationDotStatus | null;
  text: string;
  status: ProjectTaskStatus;
  doneAt: Date | null;
  /** Optional persisted instructions merged into the kickoff prompt when the todo is started. */
  agentInstructions: string | null;
  actorRationale: string | null;
  createdByType: ProjectTaskActorType;
  createdByAgentConfigurationId: string | null;
  createdByUserId: string | null;
  agentSuggestionStatus: AgentSuggestionStatus | null;
  agentSuggestionReviewedAt: Date | null;
  markedAsDoneByType: ProjectTaskActorType | null;
  markedAsDoneByAgentConfigurationId: string | null;
  markedAsDoneByUserId: string | null;
  sources: ProjectTaskSourceInfo[];
  createdAt: Date;
  updatedAt: Date;
};
