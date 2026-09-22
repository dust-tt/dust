import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { CODE_DEFINED_SKILLS_WORKSPACE_ID } from "@app/lib/skill_search/constants";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

export function toSkillListItem(
  auth: Authenticator,
  document: SkillSearchDocument
): Omit<SkillListItemType, "editors"> {
  const skillModelId =
    document.workspace_id === CODE_DEFINED_SKILLS_WORKSPACE_ID
      ? null
      : getResourceIdFromSId(document.skill_id);

  return {
    sId: document.skill_id,
    canAdministrate:
      skillModelId !== null &&
      SkillResource.canAdministrateCustomSkillId(auth, {
        id: skillModelId,
        workspaceId: auth.getNonNullableWorkspace().id,
      }),
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
