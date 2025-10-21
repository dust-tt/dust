import { RateLimitExceededException } from "@workos-inc/node";

import type { RegionType } from "@app/lib/api/regions/config";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import {
  FREE_NO_PLAN_CODE,
  FREE_TEST_PLAN_CODE,
} from "@app/lib/plans/plan_codes";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { launchDeleteWorkspaceWorkflow } from "@app/poke/temporal/client";
import { makeScript } from "@app/scripts/helpers";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok, removeNulls } from "@app/types";

function makeWorkOSThrottler<T>(logger: Logger) {
  return async (fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (err) {
      if (
        err instanceof RateLimitExceededException &&
        err.retryAfter !== null
      ) {
        // During testing with 500 concurrent requests, WorkOS returned:
        // - status: 429
        // - message: 'Rate limit exceeded. See the WorkOS docs for more information: https://workos.com/docs/reference/rate-limits'
        // - retryAfter: 0
        // Since retryAfter is 0, we add 1 second to ensure we don't retry immediately
        const waitTime = (err.retryAfter + 1) * 1000;
        logger.info({ waitTime }, "Waiting");
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return await fn();
      } else {
        throw normalizeError(err);
      }
    }
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

async function changeWorkOSUserRegion(
  {
    workOSUserId,
    region,
    execute,
  }: {
    workOSUserId: string;
    region: string;
    execute: boolean;
  },
  throttler: ReturnType<typeof makeWorkOSThrottler>,
  logger: Logger
) {
  const workOS = getWorkOS();

  logger.info({ user: workOSUserId }, "Setting region for user");

  if (execute) {
    try {
      await throttler(() => workOS.userManagement.getUser(workOSUserId));
    } catch (err) {
      logger.error({ user: workOSUserId, err }, "Error fetching user");
      return false;
    }

    await throttler(() =>
      workOS.userManagement.updateUser({
        userId: workOSUserId,
        metadata: {
          region,
        },
      })
    );
    logger.info({ user: workOSUserId }, "Region set for user");
  }

  return true;
}

export async function updateAllWorkspaceUsersRegionMetadata(
  auth: Authenticator,
  logger: Logger,
  {
    execute,
    newRegion,
    forceUsersWithMultipleMemberships,
  }: {
    execute: boolean;
    newRegion: RegionType;
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
    const workspaceModelIds = [
      ...new Set(externalMemberships.map((m) => m.workspaceId)),
    ];
    const workspaces =
      await WorkspaceResource.fetchByModelIds(workspaceModelIds);

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

  const organizationRes = await getOrCreateWorkOSOrganization(workspace);
  if (organizationRes.isErr()) {
    return new Err(organizationRes.error);
  }
  const organization = organizationRes.value;
  if (execute && organization.metadata.region !== newRegion) {
    await getWorkOS().organizations.updateOrganization({
      organization: organization.id,
      metadata: {
        region: newRegion,
      },
    });
  }

  const workOSUserIds = removeNulls(users.map((u) => u.workOSUserId));
  const countWorkOSRelocations = await relocateWorkOSUsers(
    workOSUserIds,
    newRegion,
    execute,
    logger
  );
  logger.info(
    { count: countWorkOSRelocations, newRegion, workspaceId: workspace.sId },
    "Relocated users in WorkOS"
  );

  return new Ok(undefined);
}

async function relocateWorkOSUsers(
  workOSUserIds: string[],
  newRegion: string,
  execute: boolean,
  logger: Logger
) {
  logger.info(`Will relocate ${workOSUserIds.length} WorkOS users`);

  let count = 0;

  const workOSThrottler = makeWorkOSThrottler(logger);

  for (const workOSUserId of workOSUserIds) {
    const hasChanged = await changeWorkOSUserRegion(
      { workOSUserId, region: newRegion, execute },
      workOSThrottler,
      logger
    );

    if (hasChanged) {
      count++;
    }
  }
  return count;
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
        forceUsersWithMultipleMemberships,
        execute,
      },
      logger
    ) => {
      const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

      const res = await updateAllWorkspaceUsersRegionMetadata(auth, logger, {
        execute,
        newRegion: destinationRegion as RegionType,
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
