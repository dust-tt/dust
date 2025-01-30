import { concurrentExecutor, removeNulls } from "@dust-tt/types";

import { getAuth0ManagemementClient, throttleAuth0 } from "@app/lib/api/auth0";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    destinationRegion: {
      type: "string",
      required: true,
      choices: SUPPORTED_REGIONS,
    },
    workspaceId: {
      type: "string",
      required: true,
    },
    rateLimitThreshold: {
      type: "number",
      required: false,
      default: 3,
    },
  },
  async (
    { destinationRegion, workspaceId, rateLimitThreshold, execute },
    logger
  ) => {
    const managementClient = getAuth0ManagemementClient();

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspace = auth.getNonNullableWorkspace();

    const members = await MembershipResource.getMembershipsForWorkspace({
      workspace,
    });
    const userIds = removeNulls(members.memberships.map((m) => m.userId));
    const allMemberships = await MembershipResource.fetchByUserIds(userIds);

    const externalMemberships = allMemberships.filter(
      (m) => m.workspaceId !== workspace.id
    );
    if (externalMemberships.length > 0) {
      const userIds = externalMemberships.map((m) => m.userId);
      const users = await UserResource.fetchByModelIds(userIds);
      logger.error(
        {
          externalMemberships,
          users: users.map((u) => ({ sId: u.sId, email: u.email })),
        },
        "Some users have mutiple memberships"
      );
      process.exit(1);
    }

    const users = await UserResource.fetchByModelIds(userIds);
    const auth0Ids = removeNulls(users.map((u) => u.auth0Sub));

    logger.info(`Will relocate ${users.length} users`);

    let count = 0;

    await concurrentExecutor(
      auth0Ids,
      async (auth0Id) => {
        count++;
        logger.info({ user: auth0Id, count }, "Setting region");
        if (execute) {
          await throttleAuth0(
            () =>
              managementClient.users.update(
                {
                  id: auth0Id,
                },
                {
                  app_metadata: {
                    region: destinationRegion,
                  },
                }
              ),
            { rateLimitThreshold }
          );
        }
      },
      {
        concurrency: 10,
      }
    );
  }
);
