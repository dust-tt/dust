import _ from "lodash";

import { Workspace } from "@app/lib/models/workspace";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { makeScript } from "@app/scripts/helpers";
import { Authenticator } from "@app/lib/auth";

async function backfillWorkspacesGroup(execute: boolean) {
  const workspaces = await Workspace.findAll();

  const chunks = _.chunk(workspaces, 16);
  for (const [i, c] of chunks.entries()) {
    console.log(
      `[execute=${execute}] Processing chunk of ${c.length} workspaces... (${
        i + 1
      }/${chunks.length})`
    );
    await Promise.all(
      c.map(async (w) => {
        const auth = await Authenticator.internalAdminForWorkspace(w.sId);
        const allSpaces = await SpaceResource.listWorkspaceSpaces(auth);
        const regularSpaces = allSpaces.filter((s) => s.kind === "regular");
        for (const space of regularSpaces) {
          if (space.groups.length === 1) {
            const group = space.groups[0];
            if (execute) {
              await group.updateName(auth, `Group for space ${space.name}`);
            } else {
              console.log(
                `Would update group ${group.id} to "Group for space ${space.name}"`
              );
            }
          }
        }
      })
    );
  }

  console.log(`Done.`);
}

makeScript({}, async ({ execute }) => {
  await backfillWorkspacesGroup(execute);
});
