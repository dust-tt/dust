import type { ModelId } from "@app/types/shared/model_id";

export const PROJECT_TODO_CATEGORIES = ["to_do", "to_know"] as const;

export type ProjectTodoCategory = (typeof PROJECT_TODO_CATEGORIES)[number];

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

// Safe public representation of a ProjectTodo — no internal ModelIds exposed.
export type ProjectTodoType = {
  id: ModelId;
  sId: string;
  conversationId: string | null;
  category: ProjectTodoCategory;
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
