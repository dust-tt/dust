import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Run a worker function on workspaces.
 *
 * - If `wId` is provided, runs on that single workspace.
 * - Otherwise runs on all workspaces, ordered by numeric model id.
 * - `fromWorkspaceId` skips workspaces with model id < this value (for resuming).
 * - `filter` can skip workspaces before running the worker.
 */
export async function runOnAllWorkspaces(
  worker: (workspace: LightWorkspaceType) => Promise<void>,
  {
    concurrency = 1,
    filter,
    wId,
    fromWorkspaceId,
  }: {
    concurrency?: number;
    filter?: (workspace: LightWorkspaceType) => boolean | Promise<boolean>;
    wId?: string;
    fromWorkspaceId?: number;
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
    const all = await WorkspaceResource.listAll("ASC");
    const filtered = fromWorkspaceId
      ? all.filter((w) => w.id >= fromWorkspaceId)
      : all;
    workspaces = filtered.map((w) =>
      renderLightWorkspaceType({ workspace: w })
    );
  }

  if (filter) {
    const filterResults = await concurrentExecutor(
      workspaces,
      async (workspace) => ({
        keep: await filter(workspace),
        workspace,
      }),
      { concurrency }
    );
    workspaces = filterResults
      .filter(({ keep }) => keep)
      .map(({ workspace }) => workspace);
  }

  await concurrentExecutor(workspaces, (workspace) => worker(workspace), {
    concurrency,
  });
}
