import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";

makeScript({}, async ({ execute }) => {
  await runOnAllWorkspaces(async (w) => {
    const auth = await Authenticator.internalAdminForWorkspace(w.sId);
    const allSpaces = await SpaceResource.listWorkspaceSpaces(auth);
    const regularSpaces = allSpaces.filter(
      (s) => s.kind === "regular" || s.kind === "public"
    );
    console.log(
      `Found ${regularSpaces.length} regular spaces for workspace ${w.name}`
    );
    for (const space of regularSpaces) {
      const regularGroups = space.groups.filter((g) => g.isRegular());
      if (regularGroups.length === 1) {
        const group = regularGroups[0];
        if (execute) {
          await group.updateName(auth, `Group for space ${space.name}`);
        }
        console.log(
          `[Execute: ${execute}] Updating group ${group.id} to "Group for space ${space.name}"`
        );
      }
    }
    console.log(`Done for workspace ${w.name}`);
  });
});
