import { Op } from "sequelize";

import { Membership, Workspace } from "@app/lib/models/workspace";

export async function countActiveSeatsInWorkspace(
  workspaceId: string
): Promise<number> {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Workspace not found for sId: ${workspaceId}`);
  }
  return await Membership.count({
    where: {
      workspaceId: workspace.id,
      role: {
        [Op.notIn]: ["none", "revoked"],
      },
    },
  });
}
