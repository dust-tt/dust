import type { Result } from "@dust-tt/types";
import { Err, Ok, removeNulls } from "@dust-tt/types";
import type { ApiResponse } from "auth0";

import { getAuth0ManagemementClient } from "@app/lib/api/auth0";
import type { RegionType } from "@app/lib/api/regions/config";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

let remaining = 10;
let resetTime = Date.now();

function makeAuth0Throttler<T>(
  { rateLimitThreshold }: { rateLimitThreshold: number },
  logger: Logger
) {
  return async (fn: () => Promise<ApiResponse<T>>) => {
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
}

async function changeUserRegion(
  {
    auth0Id,
    region,
    execute,
  }: {
    auth0Id: string;
    region: string;
    execute: boolean;
  },
  throttler: ReturnType<typeof makeAuth0Throttler>,
  logger: Logger
) {
  const managementClient = getAuth0ManagemementClient();

  logger.info({ user: auth0Id }, "Setting region for user");

  if (execute) {
    try {
      await throttler(() => managementClient.users.get({ id: auth0Id }));
    } catch (err) {
      logger.error({ user: auth0Id, err }, "Error fetching user");
      return false;
    }

    await throttler(() =>
      managementClient.users.update(
        {
          id: auth0Id,
        },
        {
          app_metadata: {
            region,
          },
        }
      )
    );

    logger.info({ user: auth0Id }, "Region set for user");
  }

  return true;
}

export async function updateAllWorkspaceUsersRegionMetadata(
  auth: Authenticator,
  logger: Logger,
  {
    execute,
    newRegion,
    rateLimitThreshold,
  }: {
    execute: boolean;
    newRegion: RegionType;
    rateLimitThreshold: number;
  }
): Promise<Result<void, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const members = await MembershipResource.getMembershipsForWorkspace({
    workspace,
  });
  const userIds = [
    ...new Set(removeNulls(members.memberships.map((m) => m.userId))),
  ];
  const allMemberships = await MembershipResource.fetchByUserIds(userIds);

  const externalMemberships = allMemberships.filter(
    (m) => m.workspaceId !== workspace.id
  );
  if (externalMemberships.length > 0) {
    logger.error(
      { users: externalMemberships.map((m) => m.user) },
      "Some users have mutiple memberships"
    );

    return new Err(new Error("Some users have mutiple memberships"));
  }

  const users = await UserResource.fetchByModelIds(userIds);
  const auth0Ids = removeNulls(users.map((u) => u.auth0Sub));

  logger.info(`Will relocate ${users.length} users`);

  let count = 0;

  const throttler = makeAuth0Throttler({ rateLimitThreshold }, logger);

  for (const auth0Id of auth0Ids) {
    const hasChanged = await changeUserRegion(
      { auth0Id, region: newRegion, execute },
      throttler,
      logger
    );

    if (hasChanged) {
      count++;
    }
  }

  logger.info(
    { count, newRegion, workspaceId: workspace.sId },
    "Relocated users in Auth0"
  );

  return new Ok(undefined);
}

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
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const res = await updateAllWorkspaceUsersRegionMetadata(auth, logger, {
      execute,
      newRegion: destinationRegion as RegionType,
      rateLimitThreshold,
    });

    if (res.isErr()) {
      logger.error(res.error.message);
      return;
    }

    logger.info("Done");
  }
);
