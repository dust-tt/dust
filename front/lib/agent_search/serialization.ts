import type {
  AgentSearchDocument,
  AgentSearchListItemType,
} from "@app/types/agent_search/agent_search";

export function toAgentListItem(
  document: AgentSearchDocument
): AgentSearchListItemType {
  return {
    sId: document.agent_id,
    status: document.status,
    scope: document.scope,
    name: document.name,
    description: document.description,
    pictureUrl: document.picture_url,
    model: document.model
      ? {
          providerId: document.model.provider_id,
          modelId: document.model.model_id,
          reasoningEffort: document.model.reasoning_effort,
        }
      : null,
    feedbacks: {
      up: document.feedback_positive_count,
      down: document.feedback_negative_count,
    },
    requestedSpaceIds: document.requested_space_ids,
    tagIds: document.tag_ids,
    editorIds: document.editor_ids,
    editedBy: document.last_edited_by_user_id,
    activeUsersCount: document.active_users_count,
    updatedAt:
      document.updated_at === null
        ? null
        : new Date(document.updated_at).getTime(),
  };
}
