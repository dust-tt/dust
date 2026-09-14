import { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

import type { SeedContext } from "./types";

interface SeedGroupOptions {
  name: string;
  kind: "provisioned" | "regular_manual";
  members: UserResource[];
}

export async function seedGroup(
  ctx: SeedContext,
  { name, kind, members }: SeedGroupOptions
): Promise<GroupResource | undefined> {
  const { auth, workspace, execute, logger } = ctx;

  if (await GroupResource.groupExistsByName(auth, name)) {
    logger.info({ name }, "Group already exists, skipping");
    return undefined;
  }

  if (!execute) {
    return undefined;
  }

  const group = await GroupResource.makeNew({
    name,
    kind,
    workspaceId: workspace.id,
    // Provisioned groups mirror an identity provider group, which the seed fakes.
    workOSGroupId: kind === "provisioned" ? `workos-group-${name}` : null,
  });

  const addMembersResult = await group.dangerouslyAddMembers(auth, {
    users: members.map((u) => u.toJSON()),
    allowProvisionedGroups: kind === "provisioned",
  });
  if (addMembersResult.isErr()) {
    throw new Error(
      `Failed to add users to group ${name}: ${addMembersResult.error.message}`
    );
  }

  logger.info({ sId: group.sId, name, kind }, "Group created");
  return group;
}
