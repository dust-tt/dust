import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

export function toSkillListItem(
  document: SkillSearchDocument
): SkillListItemType {
  return {
    sId: document.skill_id,
    status: document.status,
    name: document.name,
    userFacingDescription: document.description ?? "",
    icon: document.icon,
    requestedSpaceIds: document.requested_space_ids,
    mcpServerViewIds: document.mcp_server_view_ids,
    editorIds: document.editor_ids,
    editedBy: document.last_edited_by_user_id,
    availability: document.availability,
    activeUsersCount: document.active_users_count,
    updatedAt:
      document.updated_at === null
        ? null
        : new Date(document.updated_at).getTime(),
  };
}
