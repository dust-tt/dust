import type { DataSourceWithAgentsUsageType, Result } from "@dust-tt/types";
import { Err, Ok, removeNulls } from "@dust-tt/types";
import assert from "assert";
import { uniq } from "lodash";

import { hardDeleteApp } from "@app/lib/api/apps";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserResource } from "@app/lib/resources/user_resource";
import { isPrivateSpacesLimitReached } from "@app/lib/spaces";
import logger from "@app/logger/logger";
import { launchScrubSpaceWorkflow } from "@app/poke/temporal/client";

export async function softDeleteSpaceAndLaunchScrubWorkflow(
  auth: Authenticator,
  space: SpaceResource
) {
  assert(auth.isAdmin(), "Only admins can delete spaces.");
  assert(space.isRegular(), "Cannot delete non regular spaces.");

  const dataSourceViews = await DataSourceViewResource.listBySpace(auth, space);

  const usages: DataSourceWithAgentsUsageType[] = [];
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

  if (usages.length > 0) {
    const agentNames = uniq(usages.map((u) => u.agentNames).flat());
    return new Err(
      new Error(
        `Cannot delete space with data source in use by assistant(s): ${agentNames.join(", ")}.`
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

  await frontSequelize.transaction(async (t) => {
    // Soft delete all data source views.
    for (const view of dataSourceViews) {
      // Soft delete view, they will be hard deleted when the data source scrubbing job runs.
      const res = await view.delete(auth, {
        transaction: t,
        hardDelete: false,
      });
      if (res.isErr()) {
        throw res.error;
      }
    }

    // Soft delete data sources they will be hard deleted in the scrubbing job.
    for (const ds of dataSources) {
      const res = await ds.delete(auth, { hardDelete: false, transaction: t });
      if (res.isErr()) {
        throw res.error;
      }
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

  await frontSequelize.transaction(async (t) => {
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
  {
    name,
    memberIds,
    isRestricted,
  }: { name: string; memberIds: string[] | null; isRestricted: boolean },
  { ignoreWorkspaceLimit = false }: { ignoreWorkspaceLimit?: boolean } = {}
): Promise<Result<SpaceResource, DustError | Error>> {
  const owner = auth.getNonNullableWorkspace();

  const plan = auth.getNonNullablePlan();
  const all = await SpaceResource.listWorkspaceSpaces(auth);
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

  const nameAvailable = await SpaceResource.isNameAvailable(auth, name);
  if (!nameAvailable) {
    return new Err(
      new DustError("space_already_exists", "This space name is already used.")
    );
  }

  const group = await GroupResource.makeNew({
    name: `Group for space ${name}`,
    workspaceId: owner.id,
    kind: "regular",
  });

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
      workspaceId: owner.id,
    },
    groups
  );

  if (memberIds) {
    const users = (await UserResource.fetchByIds(memberIds)).map((user) =>
      user.toJSON()
    );
    const groupsResult = await group.addMembers(auth, users);
    if (groupsResult.isErr()) {
      logger.error(
        {
          error: groupsResult.error,
        },
        "The space cannot be created - group members could not be added"
      );

      return new Err(new Error("The space cannot be created."));
    }
  }

  return new Ok(space);
}
