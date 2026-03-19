export const PROJECT_TODO_CATEGORIES = [
  "need_attention",
  "key_decisions",
  "follow_ups",
  "notable_updates",
] as const;

export type ProjectTodoCategory = (typeof PROJECT_TODO_CATEGORIES)[number];

export const PROJECT_TODO_STATUSES = ["todo", "in_progress", "done"] as const;

export type ProjectTodoStatus = (typeof PROJECT_TODO_STATUSES)[number];

export const PROJECT_TODO_ACTOR_TYPES = ["user", "agent"] as const;

export type ProjectTodoActorType = (typeof PROJECT_TODO_ACTOR_TYPES)[number];

export const PROJECT_TODO_SOURCE_TYPES = ["conversation"] as const;

export type ProjectTodoSourceType = (typeof PROJECT_TODO_SOURCE_TYPES)[number];
