import { removeNulls } from "@dust-tt/types";
import type { ApiResponse } from "auth0";

import { getAuth0ManagemementClient } from "@app/lib/api/auth0";
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

    let remaining = 10;
    let resetTime = Date.now();

    const throttleAuth0 = async <T>(fn: () => Promise<ApiResponse<T>>) => {
      if (remaining < rateLimitThreshold) {
        const now = Date.now();
        const waitTime = resetTime * 1000 - now;
        logger.info({ waitTime }, "Waiting");
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      const res = await fn();
      if (res.status !== 200) {
        logger.error({ res }, "When calling Auth0");
        process.exit(1);
      }

      remaining = Number(res.headers.get("x-ratelimit-remaining"));
      resetTime = Number(res.headers.get("x-ratelimit-reset"));

      const limit = Number(res.headers.get("x-ratelimit-limit"));
      logger.info({ limit, remaining, resetTime }, "Rate limit");

      return res.data;
    };

    const members = await MembershipResource.getMembershipsForWorkspace({
      workspace,
    });
    const userIds = removeNulls(members.memberships.map((m) => m.userId));
    const allMemberships = await MembershipResource.fetchByUserIds(userIds);

    const externalMemberships = allMemberships.filter(
      (m) => m.workspaceId !== workspace.id
    );
    if (externalMemberships.length > 0) {
      logger.error(
        { users: externalMemberships.map((m) => m.user) },
        "Some users have mutiple memberships"
      );
      process.exit(1);
    }

    const users = await UserResource.fetchByModelIds(userIds);
    const auth0Ids = removeNulls(users.map((u) => u.auth0Sub));

    logger.info(`Will relocate ${users.length} users`);

    let count = 0;

    for (const auth0Id of auth0Ids) {
      count++;
      logger.info({ user: auth0Id, count }, "Setting region");
      if (execute) {
        await throttleAuth0(() =>
          managementClient.users.update(
            {
              id: auth0Id,
            },
            {
              app_metadata: {
                region: destinationRegion,
              },
            }
          )
        );
      }
    }
  }
);
