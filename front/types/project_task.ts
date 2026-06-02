import type { ConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import type { ModelId } from "@app/types/shared/model_id";

export const POD_TASK_STATUSES = ["todo", "in_progress", "done"] as const;

export type PodTaskStatus = (typeof POD_TASK_STATUSES)[number];

export const POD_TASK_ACTOR_TYPES = ["user", "agent"] as const;

export type PodTaskActorType = (typeof POD_TASK_ACTOR_TYPES)[number];

export const POD_TASK_SOURCE_TYPES = [
  "project_conversation",
  "project_knowledge",
  "slack",
  "notion",
  "gdrive",
  "confluence",
  "github",
  "microsoft",
] as const;

export type PodTaskSourceType = (typeof POD_TASK_SOURCE_TYPES)[number];

export const AGENT_SUGGESTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type AgentSuggestionStatus = (typeof AGENT_SUGGESTION_STATUSES)[number];

export const POD_TASK_PERIOD_SCOPES = [
  "active",
  "last_24h",
  "last_7d",
  "last_30d",
] as const;
export type PodTaskPeriodScope = (typeof POD_TASK_PERIOD_SCOPES)[number];

export function isPodTaskPeriodScope(v: string): v is PodTaskPeriodScope {
  return POD_TASK_PERIOD_SCOPES.includes(v as PodTaskPeriodScope);
}

export const POD_TASK_PEOPLE_SCOPES = ["just_mine", "all_project"] as const;
export type PodTaskPeopleScope = (typeof POD_TASK_PEOPLE_SCOPES)[number];

export function isPodTaskPeopleScope(v: string): v is PodTaskPeopleScope {
  return POD_TASK_PEOPLE_SCOPES.includes(v as PodTaskPeopleScope);
}

export type PodTaskSourceInfo = {
  sourceType: PodTaskSourceType;
  sourceId: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
};

export type PodTaskAssigneeType = {
  sId: string;
  fullName: string;
  image: string | null;
};

/** Stable row / stable-order key when grouping tasks with no assignee. */
export const POD_TASK_UNASSIGNED_GROUP_KEY = "__unassigned__";

/** Header and menu copy for tasks with no assignee. */
export const POD_TASK_NO_ASSIGNEE_LABEL = "No assignee";

/** Seeded via POST /pods/:podId/tasks/seed (editors only). */
export const POD_MANAGER_AGENT_SID = "pod_manager" as const;

export type PodTaskType = {
  id: ModelId;
  sId: string;
  user: PodTaskAssigneeType | null;
  conversationId: string | null;
  /** Same semantics as the left sidebar conversation row (see `getConversationDotStatus`). */
  conversationSidebarStatus: ConversationDotStatus | null;
  conversationIsRunningAgentLoop: boolean | null;
  text: string;
  status: PodTaskStatus;
  doneAt: Date | null;
  /** Optional persisted instructions merged into the kickoff prompt when the todo is started. */
  agentInstructions: string | null;
  actorRationale: string | null;
  createdByType: PodTaskActorType;
  createdByAgentConfigurationId: string | null;
  createdByUserId: string | null;
  agentSuggestionStatus: AgentSuggestionStatus | null;
  agentSuggestionReviewedAt: Date | null;
  markedAsDoneByType: PodTaskActorType | null;
  markedAsDoneByAgentConfigurationId: string | null;
  markedAsDoneByUserId: string | null;
  sources: PodTaskSourceInfo[];
  createdAt: Date;
  updatedAt: Date;
};
