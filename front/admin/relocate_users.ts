import type { ApiResponse } from "auth0";

import { getAuth0ManagemementClient } from "@app/lib/api/auth0";
import type { RegionType } from "@app/lib/api/regions/config";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { deleteWorkspace } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import {
  FREE_NO_PLAN_CODE,
  FREE_TEST_PLAN_CODE,
} from "@app/lib/plans/plan_codes";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { Result } from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";
import { launchDeleteWorkspaceWorkflow } from "@app/poke/temporal/client";

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

async function isWorkspaceEmpty(auth: Authenticator) {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();

  // Check if workspace is on a free plan
  if (
    ![FREE_NO_PLAN_CODE, FREE_TEST_PLAN_CODE].includes(subscription.plan.code)
  ) {
    return false;
  }

  // Check for data sources
  const dataSources = await DataSourceResource.listByWorkspace(auth);
  if (dataSources.length > 0) {
    return false;
  }

  // Check for agents
  const agents = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });

  if (agents.length > 0) {
    return false;
  }

  return true;
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
    forceUsersWithMultipleMemberships,
  }: {
    execute: boolean;
    newRegion: RegionType;
    rateLimitThreshold: number;
    forceUsersWithMultipleMemberships: boolean;
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
    // Group memberships by workspace to check each one
    const workspaceIds = [
      ...new Set(externalMemberships.map((m) => m.workspaceId)),
    ];
    const workspaces = await Workspace.findAll({
      where: {
        id: workspaceIds,
      },
    });

    const nonEmptyWorkspaces = [];
    for (const w of workspaces) {
      const workspaceAuth = await Authenticator.internalAdminForWorkspace(
        w.sId
      );
      const isEmpty = await isWorkspaceEmpty(workspaceAuth);

      if (isEmpty && execute) {
        // Delete empty workspace
        logger.info({ workspaceId: w.sId }, "Found empty workspace, deleting");
        const deleteRes = await launchDeleteWorkspaceWorkflow({
          workspaceId: w.sId,
        });
        if (deleteRes.isErr()) {
          logger.error(
            { workspaceId: w.sId, error: deleteRes.error.message },
            "Failed to delete workspace"
          );
        }
      } else if (!isEmpty) {
        nonEmptyWorkspaces.push(w);
      }
    }

    if (nonEmptyWorkspaces.length > 0) {
      logger.error(
        {
          nonEmptyWorkspaces: nonEmptyWorkspaces.map((w) => ({
            workspaceId: w.sId,
          })),
        },
        "Some users have memberships in non-empty workspaces. Can be ignored by setting the " +
          "forceUsersWithMultipleMemberships flag."
      );

      if (!forceUsersWithMultipleMemberships) {
        return new Err(
          new Error("Some users have memberships in non-empty workspaces")
        );
      }
    }
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

// Only run the script if this file is being executed directly.
if (require.main === module) {
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
      forceUsersWithMultipleMemberships: {
        type: "boolean",
        required: false,
        default: false,
      },
    },
    async (
      {
        destinationRegion,
        workspaceId,
        rateLimitThreshold,
        forceUsersWithMultipleMemberships,
        execute,
      },
      logger
    ) => {
      const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

      const res = await updateAllWorkspaceUsersRegionMetadata(auth, logger, {
        execute,
        newRegion: destinationRegion as RegionType,
        rateLimitThreshold,
        forceUsersWithMultipleMemberships,
      });

      if (res.isErr()) {
        logger.error(res.error.message);
        return;
      }

      logger.info("Done");
    }
  );
}
