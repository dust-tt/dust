import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { cacheWithRedis } from "@app/lib/utils/cache";
import { renderLightWorkspaceType } from "@app/lib/workspace";

export async function countActiveSeatsInWorkspace(
  workspaceId: string
): Promise<number> {
  const workspace = await WorkspaceModel.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Workspace not found for sId: ${workspaceId}`);
  }

  return MembershipResource.getMembersCountForWorkspace({
    workspace: renderLightWorkspaceType({ workspace }),
    activeOnly: true,
  });
}

export const countActiveSeatsInWorkspaceCached = cacheWithRedis(
  countActiveSeatsInWorkspace,
  (workspaceId) => {
    return `count-active-seats-in-workspace:${workspaceId}`;
  },
  {
    ttlMs: 60 * 10 * 1000, // 10 minutes
  }
);
