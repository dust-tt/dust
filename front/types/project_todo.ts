import type { ConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import type { ModelId } from "@app/types/shared/model_id";

export const PROJECT_TODO_STATUSES = ["todo", "in_progress", "done"] as const;

export type ProjectTodoStatus = (typeof PROJECT_TODO_STATUSES)[number];

export const PROJECT_TODO_ACTOR_TYPES = ["user", "agent"] as const;

export type ProjectTodoActorType = (typeof PROJECT_TODO_ACTOR_TYPES)[number];

export const PROJECT_TODO_SOURCE_TYPES = [
  "project_conversation",
  "project_knowledge",
  "slack",
  "notion",
  "gdrive",
  "confluence",
  "github",
  "microsoft",
] as const;

export type ProjectTodoSourceType = (typeof PROJECT_TODO_SOURCE_TYPES)[number];

export const AGENT_SUGGESTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type AgentSuggestionStatus = (typeof AGENT_SUGGESTION_STATUSES)[number];

export type ProjectTodoSourceInfo = {
  sourceType: ProjectTodoSourceType;
  sourceId: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
};

export type ProjectTodoAssigneeType = {
  sId: string;
  fullName: string;
  image: string | null;
};

export type ProjectTodoType = {
  id: ModelId;
  sId: string;
  user: ProjectTodoAssigneeType | null;
  conversationId: string | null;
  /** Same semantics as the left sidebar conversation row (see `getConversationDotStatus`). */
  conversationSidebarStatus: ConversationDotStatus | null;
  text: string;
  status: ProjectTodoStatus;
  doneAt: Date | null;
  /** Optional persisted instructions merged into the kickoff prompt when the todo is started. */
  agentInstructions: string | null;
  actorRationale: string | null;
  createdByType: ProjectTodoActorType;
  createdByAgentConfigurationId: string | null;
  createdByUserId: string | null;
  agentSuggestionStatus: AgentSuggestionStatus | null;
  agentSuggestionReviewedAt: Date | null;
  markedAsDoneByType: ProjectTodoActorType | null;
  markedAsDoneByAgentConfigurationId: string | null;
  markedAsDoneByUserId: string | null;
  sources: ProjectTodoSourceInfo[];
  createdAt: Date;
  updatedAt: Date;
};
