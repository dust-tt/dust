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
  actorRationale: string | null;
  createdByType: ProjectTodoActorType;
  createdByAgentConfigurationId: string | null;
  markedAsDoneByType: ProjectTodoActorType | null;
  markedAsDoneByAgentConfigurationId: string | null;
  sources: ProjectTodoSourceInfo[];
  createdAt: Date;
  updatedAt: Date;
};
