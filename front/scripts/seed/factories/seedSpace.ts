import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

import type { SeedContext } from "./types";

const RESTRICTED_SPACE_NAME = "Restricted Space";

interface SeedSpaceOptions {
  name?: string;
  // Members to add on top of the context user.
  members?: UserResource[];
  // Whether the context user is a member of the space. Set to false to seed a space the context
  // user cannot access.
  withContextUser?: boolean;
}

export async function seedSpace(
  ctx: SeedContext,
  {
    name = RESTRICTED_SPACE_NAME,
    members = [],
    withContextUser = true,
  }: SeedSpaceOptions = {}
): Promise<SpaceResource | undefined> {
  const { auth, workspace, user, execute, logger } = ctx;

  const existingSpaces = await SpaceResource.listWorkspaceSpaces(auth);
  const existingRestrictedSpace = existingSpaces.find((s) => s.name === name);

  if (existingRestrictedSpace) {
    logger.info(
      { sId: existingRestrictedSpace.sId, name },
      "Restricted space already exists, skipping"
    );
    return existingRestrictedSpace;
  }

  if (execute) {
    // Create a group for the restricted space
    const group = await GroupResource.makeNew({
      name: `Group for ${name}`,
      workspaceId: workspace.id,
      kind: "regular_auto",
    });

    // Create the restricted space
    const restrictedSpace = await SpaceResource.makeNew(
      auth,
      {
        name,
        kind: "regular",
        workspaceId: workspace.id,
      },
      { members: [group] }
    );

    // The member group is a regular_auto group whose permissions are not
    // checked directly; gate on administration of the space instead.
    if (!auth.can("admin", restrictedSpace)) {
      throw new Error("Only admins or group editors can change group members");
    }
    // Add the users to the group so they can access the space
    const addMemberResult = await group.dangerouslyAddMembers(auth, {
      users: (withContextUser ? [user, ...members] : members).map((u) =>
        u.toJSON()
      ),
    });
    if (addMemberResult.isErr()) {
      throw new Error(
        `Failed to add users to group: ${addMemberResult.error.message}`
      );
    }

    logger.info({ sId: restrictedSpace.sId, name }, "Restricted space created");
    return restrictedSpace;
  }

  return undefined;
}
