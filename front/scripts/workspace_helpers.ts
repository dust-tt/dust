import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { LightWorkspaceType } from "@app/types/user";

export async function runOnAllWorkspaces(
  worker: (workspace: LightWorkspaceType) => Promise<void>,
  { concurrency }: { concurrency: number } = { concurrency: 1 }
) {
  const workspaces = await WorkspaceResource.listAll();

  await concurrentExecutor(
    workspaces,
    (workspace) => worker(renderLightWorkspaceType({ workspace })),
    { concurrency }
  );
}
