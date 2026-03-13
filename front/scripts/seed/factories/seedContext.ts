import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import type { SeedContext } from "@app/scripts/seed/factories/types";

// The workspace sId created by dust-hive seed
const WORKSPACE_SID = "DevWkSpace";

export async function createSeedContext({
  execute,
  logger,
}: {
  execute: boolean;
  logger: Logger;
}): Promise<SeedContext> {
  logger.info("Loading workspace...");
  const workspace = await WorkspaceResource.fetchById(WORKSPACE_SID);
  if (!workspace) {
    throw new Error(
      `Workspace ${WORKSPACE_SID} not found. Make sure dust-hive seed has run first.`
    );
  }

  // Get the first admin user from the workspace
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: renderLightWorkspaceType({ workspace }),
    roles: ["admin"],
  });
  if (memberships.length === 0) {
    throw new Error(
      `No admin user found in workspace ${WORKSPACE_SID}. Make sure dust-hive seed has run first.`
    );
  }
  const membershipUser = memberships[0].user;
  if (!membershipUser) {
    throw new Error("Membership has no associated user");
  }

  // Fetch the full UserResource
  const user = await UserResource.fetchById(membershipUser.sId);
  if (!user) {
    throw new Error("User not found");
  }

  // Create authenticator with the user
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    WORKSPACE_SID
  );

  return {
    auth,
    workspace: renderLightWorkspaceType({ workspace }),
    user,
    execute,
    logger,
  };
}
