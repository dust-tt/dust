import _ from "lodash";

import { Workspace } from "@app/lib/models/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { makeScript } from "@app/scripts/helpers";

async function backfillWorkspacesGroup(execute: boolean) {
  const workspaces = await Workspace.findAll();

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
              await GroupResource.makeNew({
                name: "System",
                type: "system",
                workspaceId: w.id,
              });
              await GroupResource.makeNew({
                name: "Workspace",
                type: "global",
                workspaceId: w.id,
              });
              console.log(`System group created for workspace ${w.id}`);
            } catch (error) {
              if (error instanceof Error && error.cause) {
                switch (error.cause) {
                  case "enforce_one_system_group_per_workspace":
                    console.log(
                      `System group already exists for workspace ${w.id}`
                    );
                    break;
                  case "enforce_one_global_group_per_workspace":
                    console.log(
                      `Global group already exists for workspace ${w.id}`
                    );
                    break;
                  default:
                    console.error(error);
                }
              } else {
                console.error(error);
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
