import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { getCachedWorkspaceActiveSeats } from "@app/lib/workspace_seats/cache";

export async function countActiveSeatsForWorkspace(
  workspaceId: string
): Promise<number> {
  return getCachedWorkspaceActiveSeats(workspaceId, async () => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found for sId: ${workspaceId}`);
    }

    return MembershipResource.getMembersCountForWorkspace({
      workspace: renderLightWorkspaceType({ workspace }),
      activeOnly: true,
    });
  });
}
