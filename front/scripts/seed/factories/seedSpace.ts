import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

import type { SeedContext } from "./types";

const RESTRICTED_SPACE_NAME = "Restricted Space";

export async function seedSpace(
  ctx: SeedContext
): Promise<SpaceResource | undefined> {
  const { auth, workspace, user, execute, logger } = ctx;

  const existingSpaces = await SpaceResource.listWorkspaceSpaces(auth);
  const existingRestrictedSpace = existingSpaces.find(
    (s) => s.name === RESTRICTED_SPACE_NAME
  );

  if (existingRestrictedSpace) {
    logger.info(
      { sId: existingRestrictedSpace.sId, name: RESTRICTED_SPACE_NAME },
      "Restricted space already exists, skipping"
    );
    return existingRestrictedSpace;
  }

  if (execute) {
    // Create a group for the restricted space
    const group = await GroupResource.makeNew({
      name: `Group for ${RESTRICTED_SPACE_NAME}`,
      workspaceId: workspace.id,
      kind: "regular",
    });

    // Create the restricted space
    const restrictedSpace = await SpaceResource.makeNew(
      {
        name: RESTRICTED_SPACE_NAME,
        kind: "regular",
        workspaceId: workspace.id,
      },
      { members: [group] }
    );

    // if (!group.canWrite(auth)) {
    //   throw new Error("Only admins or group editors can change group members");
    // }
    // Add the user to the group so they can access the space
    const addMemberResult = await group.dangerouslyAddMember(auth, {
      user: user.toJSON(),
    });
    if (addMemberResult.isErr()) {
      throw new Error(
        `Failed to add user to group: ${addMemberResult.error.message}`
      );
    }

    logger.info({ sId: restrictedSpace.sId }, "Restricted space created");
    return restrictedSpace;
  }

  return undefined;
}
