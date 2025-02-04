import type { LightWorkspaceType } from "@dust-tt/types";
import { concurrentExecutor } from "@dust-tt/types";

import { Workspace } from "@app/lib/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";

export async function runOnAllWorkspaces(
  worker: (workspace: LightWorkspaceType) => Promise<void>,
  { concurrency }: { concurrency: number } = { concurrency: 1 }
) {
  const workspaces = await Workspace.findAll({});

  await concurrentExecutor(
    workspaces,
    (workspace) => worker(renderLightWorkspaceType({ workspace })),
    { concurrency }
  );
}
