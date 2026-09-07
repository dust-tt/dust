import type { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { LightWorkspaceType } from "@app/types/user";
import type { Attributes, WhereOptions } from "sequelize";
import { Op } from "sequelize";

function buildWorkspaceWhere({
  where,
  fromWorkspaceId,
}: {
  where?: WhereOptions<Attributes<WorkspaceModel>>;
  fromWorkspaceId?: number;
}): WhereOptions<Attributes<WorkspaceModel>> | undefined {
  if (!where && fromWorkspaceId === undefined) {
    return undefined;
  }

  const clauses: WhereOptions<Attributes<WorkspaceModel>>[] = [];
  if (where) {
    clauses.push(where);
  }
  if (fromWorkspaceId !== undefined) {
    clauses.push({ id: { [Op.gte]: fromWorkspaceId } });
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return { [Op.and]: clauses };
}

/**
 * Run a worker function on workspaces.
 *
 * - If `wId` is provided, runs on that single workspace (`where` is ignored).
 * - Otherwise runs on matching workspaces, ordered by numeric model id.
 * - `fromWorkspaceId` skips workspaces with model id < this value (for resuming).
 * - `where` is applied at the SQL level to filter early.
 */
export async function runOnAllWorkspaces(
  worker: (workspace: LightWorkspaceType) => Promise<void>,
  {
    concurrency = 1,
    wId,
    fromWorkspaceId,
    where,
  }: {
    concurrency?: number;
    wId?: string;
    fromWorkspaceId?: number;
    where?: WhereOptions<Attributes<WorkspaceModel>>;
  } = {}
) {
  let workspaces: LightWorkspaceType[];

  if (wId) {
    const workspace = await WorkspaceResource.fetchById(wId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${wId}`);
    }
    workspaces = [renderLightWorkspaceType({ workspace })];
  } else {
    const all = await WorkspaceResource.listAll("ASC", {
      where: buildWorkspaceWhere({ where, fromWorkspaceId }),
    });
    workspaces = all.map((w) => renderLightWorkspaceType({ workspace: w }));
  }

  await concurrentExecutor(workspaces, (workspace) => worker(workspace), {
    concurrency,
  });
}
