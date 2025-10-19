import _ from "lodash";

import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";

async function backfillWorkspacesGroup(execute: boolean) {
  const workspaces = await WorkspaceModel.findAll();

  const chunks = _.chunk(workspaces, 16);
  for (const [i, c] of chunks.entries()) {
    console.log(
      `[execute=${execute}] Processing chunk of ${c.length} workspaces... (${
        i + 1
      }/${chunks.length})`
    );
    if (execute) {
      await Promise.all(
        c.map((w) =>
          (async () => {
            try {
              const workspaceGroup =
                await GroupResource.internalFetchWorkspaceGlobalGroup({
                  workspaceId: w.id,
                });
              if (!workspaceGroup) {
                throw new Error("Workspace group not found");
              }
              await SpaceResource.makeNew(
                {
                  name: "Conversations",
                  kind: "conversations",
                  workspaceId: w.id,
                },
                [workspaceGroup]
              );
            } catch (error) {
              if (
                error instanceof Error &&
                error.cause &&
                error.cause === "enforce_one_conversations_space_per_workspace"
              ) {
                console.log(
                  `Conversation already exists for workspace ${w.id}`
                );
              } else {
                throw error;
              }
            }
          })()
        )
      );
    }
  }

  console.log(`Done.`);
}

makeScript({}, async ({ execute }) => {
  await backfillWorkspacesGroup(execute);
});
