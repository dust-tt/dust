import assert from "assert";
import uniq from "lodash/uniq";

import { hardDeleteApp } from "@app/lib/api/apps";
import {
  getAgentConfigurations,
  updateAgentRequestedGroupIds,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationRequirementsFromActions } from "@app/lib/api/assistant/permissions";
import { getWorkspaceAdministrationVersionLock } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { UserResource } from "@app/lib/resources/user_resource";
import { isPrivateSpacesLimitReached } from "@app/lib/spaces";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchScrubSpaceWorkflow } from "@app/poke/temporal/client";
import type { AgentsUsageType, Result } from "@app/types";
import { Err, Ok, removeNulls, SPACE_GROUP_PREFIX } from "@app/types";

export async function softDeleteSpaceAndLaunchScrubWorkflow(
  auth: Authenticator,
  space: SpaceResource,
  force?: boolean
) {
  assert(auth.isAdmin(), "Only admins can delete spaces.");
  assert(space.isRegular(), "Cannot delete non regular spaces.");

  const usages: AgentsUsageType[] = [];

  const dataSourceViews = await DataSourceViewResource.listBySpace(auth, space);
  for (const view of dataSourceViews) {
    const usage = await view.getUsagesByAgents(auth);
    if (usage.isErr()) {
      throw usage.error;
    } else if (usage.value.count > 0) {
      usages.push(usage.value);
    }
  }

  const dataSources = await DataSourceResource.listBySpace(auth, space);
  for (const ds of dataSources) {
    const usage = await ds.getUsagesByAgents(auth);
    if (usage.isErr()) {
      throw usage.error;
    } else if (usage.value.count > 0) {
      usages.push(usage.value);
    }
  }

  const apps = await AppResource.listBySpace(auth, space);
  for (const app of apps) {
    const usage = await app.getUsagesByAgents(auth);
    if (usage.isErr()) {
      throw usage.error;
    } else if (usage.value.count > 0) {
      usages.push(usage.value);
    }
  }

  if (!force && usages.length > 0) {
    const agentNames = uniq(
      usages.flatMap((u) => u.agents).map((agent) => agent.name)
    );
    return new Err(
      new Error(
        `Cannot delete space with data source or app in use by agent(s): ${agentNames.join(", ")}. If you'd like to continue set the force query parameter to true.`
      )
    );
  }

  const groupHasKeys = await KeyResource.countActiveForGroups(
    auth,
    space.groups.filter((g) => !space.isRegular() || !g.isGlobal())
  );
  if (groupHasKeys > 0) {
    return new Err(
      new Error(
        "Cannot delete group with active API Keys. Please revoke all keys before."
      )
    );
  }

  await withTransaction(async (t) => {
    // Soft delete all data source views.
    await concurrentExecutor(
      dataSourceViews,
      async (view) => {
        // Soft delete view, they will be hard deleted when the data source scrubbing job runs.
        const res = await view.delete(auth, {
          transaction: t,
          hardDelete: false,
        });
        if (res.isErr()) {
          throw res.error;
        }
      },
      { concurrency: 4 }
    );

    // Soft delete data sources they will be hard deleted in the scrubbing job.
    await concurrentExecutor(
      dataSources,
      async (ds) => {
        const res = await ds.delete(auth, {
          hardDelete: false,
          transaction: t,
        });
        if (res.isErr()) {
          throw res.error;
        }
      },
      { concurrency: 4 }
    );

    // Soft delete the apps, which will be hard deleted in the scrubbing job.
    await concurrentExecutor(
      apps,
      async (app) => {
        const res = await app.delete(auth, {
          hardDelete: false,
          transaction: t,
        });
        if (res.isErr()) {
          throw res.error;
        }
      },
      { concurrency: 4 }
    );

    if (force) {
      const agentIds = uniq(
        usages.flatMap((u) => u.agents).map((agent) => agent.sId)
      );
      await concurrentExecutor(
        agentIds,
        async (agentId) => {
          const agentConfigs = await getAgentConfigurations(auth, {
            agentIds: [agentId],
            variant: "full",
          });
          const [agentConfig] = agentConfigs;

          // Get the required group IDs from the agent's actions
          const requirements =
            await getAgentConfigurationRequirementsFromActions(auth, {
              actions: agentConfig.actions,
              ignoreSpaces: [space],
            });

          const res = await updateAgentRequestedGroupIds(
            auth,
            {
              agentId,
              newGroupIds: requirements.requestedGroupIds,
              newSpaceIds: requirements.requestedSpaceIds,
            },
            { transaction: t }
          );

          if (res.isErr()) {
            throw res.error;
          }
        },
        { concurrency: 4 }
      );
    }

    // Finally, soft delete the space.
    const res = await space.delete(auth, { hardDelete: false, transaction: t });
    if (res.isErr()) {
      throw res.error;
    }

    await launchScrubSpaceWorkflow(auth, space);
  });

  return new Ok(undefined);
}

// This method is invoked as part of the workflow to permanently delete a space.
// It ensures that all data associated with the space is irreversibly removed from the system,
// EXCEPT for data sources that are handled and deleted directly within the workflow.
export async function hardDeleteSpace(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<void, Error>> {
  assert(auth.isAdmin(), "Only admins can delete spaces.");

  assert(space.isDeletable(), "Space cannot be deleted.");

  const dataSourceViews = await DataSourceViewResource.listBySpace(
    auth,
    space,
    { includeDeleted: true }
  );
  for (const dsv of dataSourceViews) {
    const res = await dsv.delete(auth, { hardDelete: true });
    if (res.isErr()) {
      return res;
    }
  }

  const apps = await AppResource.listBySpace(auth, space, {
    includeDeleted: true,
  });
  for (const app of apps) {
    const res = await hardDeleteApp(auth, app);
    if (res.isErr()) {
      return res;
    }
  }

  await withTransaction(async (t) => {
    // Delete all spaces groups.
    for (const group of space.groups) {
      // Skip deleting global groups for regular spaces.
      if (space.isRegular() && group.isGlobal()) {
        continue;
      }

      const res = await group.delete(auth, { transaction: t });
      if (res.isErr()) {
        throw res.error;
      }
    }

    const res = await space.delete(auth, { hardDelete: true, transaction: t });
    if (res.isErr()) {
      throw res.error;
    }
  });

  return new Ok(undefined);
}

export async function createRegularSpaceAndGroup(
  auth: Authenticator,
  params:
    | {
        name: string;
        isRestricted: true;
        memberIds: string[];
        managementMode: "manual";
      }
    | {
        name: string;
        isRestricted: true;
        groupIds: string[];
        managementMode: "group";
      }
    | { name: string; isRestricted: false },
  { ignoreWorkspaceLimit = false }: { ignoreWorkspaceLimit?: boolean } = {}
): Promise<
  Result<
    SpaceResource,
    DustError<"limit_reached" | "space_already_exists" | "internal_error">
  >
> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();

  const result = await withTransaction(async (t) => {
    await getWorkspaceAdministrationVersionLock(owner, t);

    const all = await SpaceResource.listWorkspaceSpaces(auth, undefined, t);
    const isLimitReached = isPrivateSpacesLimitReached(
      all.map((v) => v.toJSON()),
      plan
    );

    if (isLimitReached && !ignoreWorkspaceLimit) {
      return new Err(
        new DustError(
          "limit_reached",
          "The maximum number of spaces has been reached."
        )
      );
    }

    const { name, isRestricted } = params;
    const managementMode = isRestricted ? params.managementMode : "manual";
    const nameAvailable = await SpaceResource.isNameAvailable(auth, name, t);
    if (!nameAvailable) {
      return new Err(
        new DustError(
          "space_already_exists",
          "This space name is already used."
        )
      );
    }

    const group = await GroupResource.makeNew(
      {
        name: `${SPACE_GROUP_PREFIX} ${name}`,
        workspaceId: owner.id,
        kind: "regular",
      },
      { transaction: t }
    );

    const globalGroupRes = isRestricted
      ? null
      : await GroupResource.fetchWorkspaceGlobalGroup(auth);

    const groups = removeNulls([
      group,
      globalGroupRes?.isOk() ? globalGroupRes.value : undefined,
    ]);

    const space = await SpaceResource.makeNew(
      {
        name,
        kind: "regular",
        managementMode,
        workspaceId: owner.id,
      },
      groups,
      t
    );

    // Handle member-based space creation
    if ("memberIds" in params && params.memberIds) {
      const users = (await UserResource.fetchByIds(params.memberIds)).map(
        (user) => user.toJSON()
      );
      const groupsResult = await group.addMembers(auth, users, {
        transaction: t,
      });
      if (groupsResult.isErr()) {
        logger.error(
          {
            error: groupsResult.error,
          },
          "The space cannot be created - group members could not be added"
        );

        return new Err(
          new DustError("internal_error", "The space cannot be created.")
        );
      }
    }

    // Handle group-based space creation
    if ("groupIds" in params && params.groupIds.length > 0) {
      // For group-based spaces, we need to associate the selected groups with the space
      const selectedGroupsResult = await GroupResource.fetchByIds(
        auth,
        params.groupIds
      );
      if (selectedGroupsResult.isErr()) {
        logger.error(
          {
            error: selectedGroupsResult.error,
          },
          "The space cannot be created - failed to fetch groups"
        );
        return new Err(
          new DustError("internal_error", "The space cannot be created.")
        );
      }

      const selectedGroups = selectedGroupsResult.value;
      for (const selectedGroup of selectedGroups) {
        await GroupSpaceModel.create(
          {
            groupId: selectedGroup.id,
            vaultId: space.id,
            workspaceId: space.workspaceId,
          },
          { transaction: t }
        );
      }
    }

    return new Ok(space);
  });

  return result;
}
