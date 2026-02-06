import assert from "assert";
import uniq from "lodash/uniq";
import { Op } from "sequelize";

import { hardDeleteApp } from "@app/lib/api/apps";
import { updateAgentRequirements } from "@app/lib/api/assistant/configuration/agent";
import { createDataSourceAndConnectorForProject } from "@app/lib/api/projects";
import { getWorkspaceAdministrationVersionLock } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { isPrivateSpacesLimitReached } from "@app/lib/spaces";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchScrubSpaceWorkflow } from "@app/poke/temporal/client";
import type { AgentsUsageType, Result } from "@app/types";
import {
  Err,
  Ok,
  PROJECT_EDITOR_GROUP_PREFIX,
  PROJECT_GROUP_PREFIX,
  SPACE_GROUP_PREFIX,
} from "@app/types";
import { assertNever } from "@app/types/shared/utils/assert_never";

export async function softDeleteSpaceAndLaunchScrubWorkflow(
  auth: Authenticator,
  space: SpaceResource,
  force?: boolean
) {
  assert(
    space.isRegular() || space.isProject(),
    "Cannot delete spaces that are not regular or project."
  );
  assert(
    space.canAdministrate(auth),
    "Only project editors or workspace admins can delete project spaces."
  );

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
    space.groups.filter(
      (g) => (!space.isRegular() && !space.isProject()) || !g.isGlobal()
    )
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

    // Get MCP server views and data source views from the space being deleted.
    const mcpServerViews = await MCPServerViewResource.listBySpace(auth, space);
    const mcpServerViewIds = mcpServerViews.map((v) => v.id);
    const dataSourceViewIds = dataSourceViews.map((v) => v.id);

    // Find all skills that reference MCP server views or data source views from this space.
    const [skillsWithMCPViews, skillsWithDataSourceViews] = await Promise.all([
      SkillResource.listByMCPServerViewIds(auth, mcpServerViewIds),
      SkillResource.listByDataSourceViewIds(auth, dataSourceViewIds),
    ]);

    // Merge and deduplicate skills.
    const skillMap = new Map<number, SkillResource>();
    for (const skill of [...skillsWithMCPViews, ...skillsWithDataSourceViews]) {
      skillMap.set(skill.id, skill);
    }
    const skillsToUpdate = Array.from(skillMap.values());

    // Create sets for quick lookup.
    const mcpServerViewIdSet = new Set(mcpServerViewIds);
    const dataSourceViewIdSet = new Set(dataSourceViewIds);

    // Update each skill to remove MCP server views and attached knowledge from the deleted space.
    // Note: updateSkill manages its own transaction, so we call it sequentially.
    for (const skill of skillsToUpdate) {
      // Filter out MCP server views from the deleted space.
      const filteredMCPServerViews = skill.mcpServerViews.filter(
        (v) => !mcpServerViewIdSet.has(v.id)
      );

      // Get attached knowledge and filter out those from the deleted space.
      const attachedKnowledge = await skill.getAttachedKnowledge(auth);
      const filteredAttachedKnowledge = attachedKnowledge.filter(
        (k) => !dataSourceViewIdSet.has(k.dataSourceView.id)
      );

      // Compute the new requestedSpaceIds from the filtered tools and knowledge.
      const requestedSpaceIds = await SkillResource.computeRequestedSpaceIds(
        auth,
        {
          mcpServerViews: filteredMCPServerViews,
          attachedKnowledge: filteredAttachedKnowledge,
        }
      );

      // Log an error if the deleted space is still in requestedSpaceIds.
      if (requestedSpaceIds.includes(space.id)) {
        logger.error(
          {
            skillId: skill.sId,
            spaceId: space.sId,
            workspaceId: auth.getNonNullableWorkspace().sId,
          },
          "Deleted space still present in skill requestedSpaceIds after filtering"
        );
      }

      await skill.updateSkill(auth, {
        name: skill.name,
        agentFacingDescription: skill.agentFacingDescription,
        userFacingDescription: skill.userFacingDescription,
        instructions: skill.instructions,
        icon: skill.icon,
        mcpServerViews: filteredMCPServerViews,
        attachedKnowledge: filteredAttachedKnowledge,
        requestedSpaceIds,
      });
    }

    // Update agents that have this space in their requestedSpaceIds.
    const agentsWithSpace = await AgentConfigurationModel.findAll({
      attributes: ["id", "requestedSpaceIds"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        status: "active",
        requestedSpaceIds: {
          [Op.contains]: [space.id],
        },
      },
    });

    await concurrentExecutor(
      agentsWithSpace,
      async (agent) => {
        const newSpaceIds = agent.requestedSpaceIds.filter(
          (id) => id !== space.id
        );
        const res = await updateAgentRequirements(
          auth,
          {
            agentModelId: agent.id,
            newSpaceIds,
          },
          { transaction: t }
        );

        if (res.isErr()) {
          throw res.error;
        }
      },
      { concurrency: 4 }
    );

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

  // Delete all webhook source views of the space.
  const webhookSourceViews = await WebhookSourcesViewResource.listBySpace(
    auth,
    space,
    { includeDeleted: true }
  );
  for (const webhookSourceView of webhookSourceViews) {
    // Delete triggers referencing this webhook source view first.
    const triggers = await TriggerResource.listByWebhookSourceViewId(
      auth,
      webhookSourceView.id
    );
    await concurrentExecutor(
      triggers,
      async (trigger) => {
        const triggerRes = await trigger.delete(auth);
        if (triggerRes.isErr()) {
          throw triggerRes.error;
        }
      },
      { concurrency: 4 }
    );

    const res = await webhookSourceView.hardDelete(auth);
    if (res.isErr()) {
      return res;
    }
  }

  await withTransaction(async (t) => {
    // Delete project metadata if this is a project space
    if (space.isProject()) {
      const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
      if (metadata) {
        const metadataRes = await metadata.delete(auth, { transaction: t });
        if (metadataRes.isErr()) {
          throw metadataRes.error;
        }
      }
    }

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

export async function createSpaceAndGroup(
  auth: Authenticator,
  params: {
    name: string;
    isRestricted: boolean;
    spaceKind: "regular" | "project";
  } & (
    | { memberIds: string[]; managementMode: "manual" }
    | { groupIds: string[]; managementMode: "group" }
  ),
  { ignoreWorkspaceLimit = false }: { ignoreWorkspaceLimit?: boolean } = {}
): Promise<
  Result<
    SpaceResource,
    DustError<
      | "limit_reached"
      | "space_already_exists"
      | "internal_error"
      | "unauthorized"
    >
  >
> {
  // Check permissions based on space kind
  // Projects can be created by any workspace member
  // Regular spaces require admin permissions
  if (params.spaceKind !== "project" && !auth.isAdmin()) {
    return new Err(
      new DustError(
        "unauthorized",
        "Only users that are `admins` can create regular spaces."
      )
    );
  }
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

    const { name, isRestricted, spaceKind, managementMode } = params;
    if (spaceKind === "regular" && !isRestricted) {
      assert(
        managementMode === "manual",
        "Unrestricted regular spaces must use manual management mode."
      );
    }

    const nameAvailable = await SpaceResource.isNameAvailable(auth, name, t);
    if (!nameAvailable) {
      return new Err(
        new DustError(
          "space_already_exists",
          "This space name is already used."
        )
      );
    }

    const membersGroup = await GroupResource.makeNew(
      {
        name: `${spaceKind === "project" ? PROJECT_GROUP_PREFIX : SPACE_GROUP_PREFIX} ${name}`,
        workspaceId: owner.id,
        kind: "regular",
      },
      { transaction: t }
    );

    let globalGroup: GroupResource | null = null;
    if (!isRestricted) {
      const globalGroupRes =
        await GroupResource.fetchWorkspaceGlobalGroup(auth);
      assert(globalGroupRes.isOk(), "Failed to fetch the global group.");
      globalGroup = globalGroupRes.value;
      assert(
        globalGroup !== null,
        "Global group must exist for non-restricted spaces."
      );
    }

    // Create the editor group for projects and add the creator
    const editorGroups: GroupResource[] = [];
    if (spaceKind === "project") {
      const creator = auth.getNonNullableUser();
      const editorGroup = await GroupResource.makeNew(
        {
          name: `${PROJECT_EDITOR_GROUP_PREFIX} ${name}`,
          workspaceId: owner.id,
          kind: "space_editors",
        },
        { transaction: t, memberIds: [creator.id] }
      );
      editorGroups.push(editorGroup);
    }

    const space = await SpaceResource.makeNew(
      {
        name,
        kind: spaceKind,
        managementMode,
        workspaceId: owner.id,
      },
      { members: [membersGroup], editors: editorGroups },
      t
    );

    if (!isRestricted) {
      // Set the global group as viewer for non-restricted project spaces
      assert(globalGroup, "Global group must exist");
      await GroupSpaceModel.create(
        {
          kind: space.isProject() ? "project_viewer" : "member",
          groupId: globalGroup.id,
          vaultId: space.id,
          workspaceId: owner.id,
        },
        {
          transaction: t,
        }
      );
    }

    // Handle member-based space creation
    switch (managementMode) {
      case "manual":
        if (spaceKind === "project") {
          assert(
            params.memberIds.length === 0,
            "Cannot add members to projects on creation."
          );
          break;
        }
        // Add members to the member group in regular spaces
        const users = (await UserResource.fetchByIds(params.memberIds)).map(
          (user) => user.toJSON()
        );
        const groupsResult = await membersGroup.addMembers(auth, {
          users,
          transaction: t,
        });
        if (groupsResult.isErr()) {
          logger.error(
            {
              error: groupsResult.error,
            },
            "Failed to add members to the member group"
          );
          return new Err(
            new DustError("internal_error", "The space cannot be created.")
          );
        }
        break;

      // Handle group-based space creation
      case "group":
        // For group-based spaces, we need to associate the selected groups with the space
        if (params.groupIds.length > 0) {
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
            await GroupSpaceMemberResource.makeNew(auth, {
              group: selectedGroup,
              space,
              transaction: t,
            });
          }
        }
        break;
      default:
        assertNever(managementMode);
    }

    // Create empty project metadata for project spaces
    if (spaceKind === "project") {
      await ProjectMetadataResource.makeNew(
        auth,
        space,
        { description: null },
        t
      );
    }

    return new Ok(space);
  });

  if (result.isOk()) {
    const space = result.value;
    if (space.kind === "project") {
      // If this is a project space, create the dust_project connector
      // Create connector outside transaction to avoid long-running transaction
      // The connector creation involves external API calls
      const connectorRes = await createDataSourceAndConnectorForProject(
        auth,
        space
      );
      if (connectorRes.isErr()) {
        logger.error(
          {
            error: connectorRes.error,
            spaceId: space.sId,
            workspaceId: owner.sId,
          },
          "Failed to create dust_project connector for project, but space was created"
        );
        // Don't fail space creation if connector creation fails
        // The connector can be created later if needed
      }
    }
  }
  return result;
}
