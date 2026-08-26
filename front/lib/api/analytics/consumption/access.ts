import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";

export async function canViewWorkspaceConsumptionAnalytics(
  auth: Authenticator
): Promise<boolean> {
  if (auth.isManager()) {
    return true;
  }

  if (!auth.user()) {
    return false;
  }

  const editableSkills = auth.getResourceIdsWithVerb("skill", "write");
  if (editableSkills.kind === "all" || editableSkills.resourceIds.length > 0) {
    return true;
  }

  const editableAgents = auth.getResourceIdsWithVerb("agent", "write");
  if (editableAgents.kind === "all" || editableAgents.resourceIds.length > 0) {
    return true;
  }

  // Agent editorship still uses editor groups. Keep legacy skill editor groups
  // here as well while existing skills transition to permission grants.
  const editorGroups = await GroupResource.fetchByModelIds(
    auth,
    auth.groupModelIds(),
    { groupKinds: ["agent_editors", "skill_editors"] }
  );

  return editorGroups.length > 0;
}
