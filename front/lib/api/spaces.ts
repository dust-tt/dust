import { remoteMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { getToolsUsage } from "@app/lib/api/agent_actions";
import {
  getDataSourceUsage,
  getDataSourceViewsUsageByModelIds,
  getDataSourceViewUsage,
} from "@app/lib/api/agent_data_sources";
import { getWebhookSourcesUsage } from "@app/lib/api/agent_triggers";
import { hardDeleteApp } from "@app/lib/api/apps";
import { updateAgentRequirements } from "@app/lib/api/assistant/configuration/agent_requirements";
import { isDatabaseFileSystemPodName } from "@app/lib/api/file_system/storage_mode";
import { createDataSourceAndConnectorForProject } from "@app/lib/api/projects/connector";
import { deleteOwnerPolicy } from "@app/lib/api/sandbox/egress_policy";
import { getReferencedSkillSpaceModelIds } from "@app/lib/api/skills/space_requirements";
import { getWorkspaceAdministrationVersionLock } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AppResource } from "@app/lib/resources/app_resource";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { isPrivateSpacesLimitReached } from "@app/lib/spaces_utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchScrubSpaceWorkflow } from "@app/poke/temporal/client";
import { DATA_SOURCE_VIEW_CATEGORIES } from "@app/types/api/public/spaces";
import type { SpaceCategoryInfo } from "@app/types/api/spaces";
import { SKILL_STATUSES } from "@app/types/assistant/skill_configuration";
import {
  isManageableGroupKind,
  PROJECT_EDITOR_GROUP_PREFIX,
  PROJECT_GROUP_PREFIX,
  SPACE_GROUP_PREFIX,
} from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import { Op, UniqueConstraintError } from "sequelize";

/**
 * Summarizes a Space's contents by category (Connected Data, Folders, Websites, Tools,
 * Triggers, Apps) with a count and agent+skill usage per category. Space landing page read model.
 *
 * Apps are legacy (`legacy_dust_apps`) and left zeroed out — not worth computing.
 *
 * Perf: Tools/Triggers usage comes from `getToolsUsage`/`getWebhookSourcesUsage`, which are
 * workspace-wide, not space-scoped; this function narrows after the fact. Fine at
 * small-to-medium scale, but repeats the full-workspace query on every space visited. If it
 * becomes hot, add view-id-scoped variants mirroring `getDataSourceViewsUsageByModelIds`.
 *
 * Known gap: `getToolsUsage` groups by MCP server, not by view, so a manually-added tool with
 * views in two regular spaces will leak combined usage into both. Same fix as above resolves it.
 */
export async function getSpaceCategoriesWithUsage(
  auth: Authenticator,
  space: SpaceResource
): Promise<Record<string, SpaceCategoryInfo>> {
  // These three listings are mutually independent — fetch together rather than one at a time.
  const [dataSourceViewsList, actions, webhookViews] = await Promise.all([
    DataSourceViewResource.listBySpace(auth, space),
    MCPServerViewResource.listBySpace(auth, space),
    WebhookSourcesViewResource.listBySpace(auth, space),
  ]);
  // "auto" tools (e.g. Pods, Computer) get a view auto-provisioned into every space —
  // they aren't meaningfully "this space's tools," so both the count and the usage below
  // are scoped to manually-added tools only, matching `getSpaceIdToActionsMap`'s convention.
  const manualActions = actions.filter(
    (a) => a.getServerDisplayMetadata().availability === "manual"
  );
  const actionsCount = manualActions.length;

  // Same here: each usage computation only needs one of the lists above, not each other's
  // output, so they can all run together too.
  const [usages, webhookUsages, toolsUsage] = await Promise.all([
    getDataSourceViewsUsageByModelIds({
      auth,
      dataSourceViewModelIds: dataSourceViewsList.map((dsv) => dsv.id),
    }),
    getWebhookSourcesUsage({ auth }),
    getToolsUsage(auth),
  ]);

  const categories: Record<string, SpaceCategoryInfo> = {};
  for (const category of DATA_SOURCE_VIEW_CATEGORIES) {
    const dataSourceViewsInCategory = dataSourceViewsList.filter(
      (view) => view.toJSON().category === category
    );

    const agents = uniqBy(
      dataSourceViewsInCategory.flatMap(
        (view) => usages[view.id]?.agents ?? []
      ),
      "sId"
    );
    const skills = uniqBy(
      dataSourceViewsInCategory.flatMap(
        (view) => usages[view.id]?.skills ?? []
      ),
      "sId"
    );

    categories[category] = {
      count: dataSourceViewsInCategory.length,
      usage: { count: agents.length + skills.length, agents, skills },
    };
  }

  categories["actions"].count = actionsCount;
  // Triggers aren't `DataSourceView`s, so the loop above leaves this at 0; patch it here.
  categories["triggers"].count = webhookViews.length;

  // Tools and Triggers aren't `DataSourceView`s, so the loop above never computes real usage
  // for them. Reuse the same batched usage functions their own admin pages already rely on,
  // narrowed down to this space's own tools/webhook sources.
  //
  // Skills never have triggers, so this stays agents-only.
  const triggerAgents = uniqBy(
    webhookViews.flatMap(
      (view) => webhookUsages[view.webhookSourceId]?.agents ?? []
    ),
    "sId"
  );
  categories["triggers"].usage = {
    count: triggerAgents.length,
    agents: triggerAgents,
    skills: [],
  };

  const getToolUsageKey = (view: MCPServerViewResource) =>
    view.internalMCPServerId ??
    remoteMCPServerNameToSId({
      remoteMCPServerId: view.remoteMCPServerId!,
      workspaceId: auth.getNonNullableWorkspace().id,
    });
  const toolAgents = uniqBy(
    manualActions.flatMap(
      (view) => toolsUsage[getToolUsageKey(view)]?.agents ?? []
    ),
    "sId"
  );
  const toolSkills = uniqBy(
    manualActions.flatMap(
      (view) => toolsUsage[getToolUsageKey(view)]?.skills ?? []
    ),
    "sId"
  );
  categories["actions"].usage = {
    count: toolAgents.length + toolSkills.length,
    agents: toolAgents,
    skills: toolSkills,
  };

  return categories;
}

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
    auth.can("admin", space),
    "Only project editors or workspace admins can delete project spaces."
  );

  // Fetched unconditionally: the delete transaction below reuses these lists either way.
  const dataSourceViews = await DataSourceViewResource.listBySpace(auth, space);
  const dataSources = await DataSourceResource.listBySpace(auth, space);
  const apps = await AppResource.listBySpace(auth, space);

  if (!force) {
    let blockedByUsage = false;
    const agentNames: string[] = [];
    const skillNames: string[] = [];

    for (const view of dataSourceViews) {
      const usage = await getDataSourceViewUsage({
        auth,
        dataSourceView: view,
      });
      if (usage.isErr()) {
        throw usage.error;
      } else if (usage.value.count > 0) {
        blockedByUsage = true;
        agentNames.push(...usage.value.agents.map((agent) => agent.name));
        skillNames.push(...usage.value.skills.map((skill) => skill.name));
      }
    }

    for (const ds of dataSources) {
      const usage = await getDataSourceUsage({ auth, dataSource: ds });
      if (usage.isErr()) {
        throw usage.error;
      } else if (usage.value.count > 0) {
        blockedByUsage = true;
        agentNames.push(...usage.value.agents.map((agent) => agent.name));
        skillNames.push(...usage.value.skills.map((skill) => skill.name));
      }
    }

    for (const app of apps) {
      const usage = await app.getUsagesByAgents(auth);
      if (usage.isErr()) {
        throw usage.error;
      } else if (usage.value.count > 0) {
        blockedByUsage = true;
        agentNames.push(...usage.value.agents.map((agent) => agent.name));
      }
    }

    if (blockedByUsage) {
      // Apps are always agents-only (skills never reference them); data sources/views can be
      // blocked by either, so the message names whichever actually uses the resource.
      const names = uniq([...agentNames, ...skillNames]);
      return new Err(
        new Error(
          `Cannot delete space with data source or app in use by: ${names.join(", ")}. If you'd like to continue set the force query parameter to true.`
        )
      );
    }
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const logContext = { spaceId: space.sId, workspaceId };

  logger.info(
    logContext,
    "softDeleteSpace: starting agent requestedSpaceIds cleanup"
  );

  try {
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

      const webhookSourceViews = await WebhookSourcesViewResource.listBySpace(
        auth,
        space
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
            const res = await trigger.delete(auth, { transaction: t });
            if (res.isErr()) {
              throw res.error;
            }
          },
          { concurrency: 4 }
        );

        const res = await webhookSourceView.delete(auth, {
          hardDelete: false,
          transaction: t,
        });
        if (res.isErr()) {
          throw res.error;
        }
      }

      // Get MCP server views and data source views from the space being deleted.
      const mcpServerViews = await MCPServerViewResource.listBySpace(
        auth,
        space
      );
      const mcpServerViewIds = mcpServerViews.map((v) => v.id);
      const dataSourceViewIds = dataSourceViews.map((v) => v.id);

      // Find all skills that reference this space, either through an MCP server
      // view / data source view located in it, or directly via requestedSpaceIds
      // (a skill can request a space without holding a live view in it).
      const [skillsWithMCPViews, skillsWithDataSourceViews, skillsWithSpace] =
        await Promise.all([
          // Every status, not just active: an archived skill keeps its references, and leaving a
          // deleted space in `requestedSpaceIds` makes the skill unfetchable — so it can never be
          // restored, or even seen again.
          SkillResource.listByMCPServerViewIds(auth, mcpServerViewIds, {
            status: [...SKILL_STATUSES],
          }),
          SkillResource.listByDataSourceViewIds(auth, dataSourceViewIds, {
            status: [...SKILL_STATUSES],
          }),
          SkillResource.listByRequestedSpaceId(auth, space.id, {
            status: [...SKILL_STATUSES],
          }),
        ]);

      // Merge and deduplicate skills.
      const skillMap = new Map<number, SkillResource>();
      for (const skill of [
        ...skillsWithMCPViews,
        ...skillsWithDataSourceViews,
        ...skillsWithSpace,
      ]) {
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

        // A deleted space cannot stay a manual choice: nothing can grant access to it any more,
        // and an id pointing at a missing space would hide the skill from everyone.
        const manuallyRequestedSpaceIds =
          skill.manuallyRequestedSpaceIds.filter(
            (spaceId) => spaceId !== space.id
          );

        // Compute the new requestedSpaceIds from the filtered tools and knowledge.
        const computedRequestedSpaceIds =
          await SkillResource.computeRequestedSpaceIds(auth, {
            mcpServerViews: filteredMCPServerViews,
            attachedKnowledge: filteredAttachedKnowledge,
          });

        // The skills this one references keep requesting their own spaces: deleting an unrelated
        // space must not drop them. A child may still request the space being deleted and the
        // cleanup order across skills is not guaranteed, so drop it here rather than let it come
        // back through a reference.
        const referencedSkillSpaceIds = (
          await getReferencedSkillSpaceModelIds(
            auth,
            skill.instructions,
            skill.sId
          )
        ).filter((spaceId) => spaceId !== space.id);

        // Rebuilt from the same four reasons a skill requests a space as when it is saved, with
        // the deleted space stripped from each of them.
        const requestedSpaceIds = uniq([
          ...computedRequestedSpaceIds, // Tools and attached knowledge.
          ...referencedSkillSpaceIds, // Nested skills.
          ...manuallyRequestedSpaceIds, // Picked by hand.
        ]);

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
          manuallyRequestedSpaceIds,
          requestedSpaceIds,
        });
      }

      // Strip the space from every agent still referencing it, atomically with
      // the space soft-delete. We query fresh here (inside the outer transaction,
      // after updateSkill's inner transactions have committed) rather than a
      // snapshot taken before the skill loop: cleaning a skill recomputes the
      // requestedSpaceIds of every agent using it, so the set of agents still
      // referencing this space can change during the loop. This catches both
      // direct references and skill-driven references left over after the loop.
      const agentsToClean = await AgentConfigurationModel.findAll({
        attributes: ["id", "requestedSpaceIds"],
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          status: "active",
          requestedSpaceIds: { [Op.contains]: [space.id] },
        },
        transaction: t,
      });

      logger.info(
        { ...logContext, agentCount: agentsToClean.length },
        "softDeleteSpace: cleaning up agent requestedSpaceIds"
      );

      await concurrentExecutor(
        agentsToClean,
        async (agent) => {
          const newSpaceIds = agent.requestedSpaceIds.filter(
            (id) => id !== space.id
          );
          const res = await updateAgentRequirements(
            auth,
            { agentModelId: agent.id, newSpaceIds },
            { transaction: t }
          );

          if (res.isErr()) {
            throw res.error;
          }
        },
        { concurrency: 4 }
      );

      // Finally, soft delete the space.
      const res = await space.delete(auth, {
        hardDelete: false,
        transaction: t,
      });
      if (res.isErr()) {
        throw res.error;
      }
    });
  } catch (err) {
    logger.error(
      { ...logContext, error: err },
      "softDeleteSpace: agent requestedSpaceIds cleanup failed — scrub workflow will NOT be launched"
    );
    throw err;
  }

  logger.info(
    logContext,
    "softDeleteSpace: agent requestedSpaceIds cleanup completed — launching scrub workflow"
  );

  await launchScrubSpaceWorkflow(auth, space);

  logger.info(logContext, "softDeleteSpace: scrub workflow launched");

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
  const triggers = await TriggerResource.listByWebhookSourceViewIds(
    auth,
    webhookSourceViews.map((view) => view.id)
  );
  const triggersRes = await TriggerResource.deleteMany(auth, triggers);
  if (triggersRes.isErr()) {
    return triggersRes;
  }

  for (const webhookSourceView of webhookSourceViews) {
    const res = await webhookSourceView.hardDelete(auth);
    if (res.isErr()) {
      return res;
    }
  }

  // Delete the pod's sandbox egress allowlist file BEFORE touching the DB:
  // if GCS refuses, we abort with everything intact, and the Temporal
  // activity driving the scrub retries the whole deletion.
  // (Owner-keyed, so it is not deleted with individual sandboxes.)
  if (space.isProject()) {
    const deleteOwnerPolicyRes = await deleteOwnerPolicy(auth, space.sId);
    if (deleteOwnerPolicyRes.isErr()) {
      return deleteOwnerPolicyRes;
    }
  }

  await withTransaction(async (t) => {
    // Delete only the space's own auto-created (regular_auto) groups. The workspace global group and
    // provisioned (IdP-owned) groups are shared and must never be deleted with a space.
    const groups = await space.fetchRegularAutoGroups(auth, t);
    for (const group of groups) {
      const res = await group.delete(auth, { transaction: t });
      if (res.isErr()) {
        throw res.error;
      }
    }

    await ConversationSelectedSpaceResource.deleteAllBySpace(auth, {
      spaceModelId: space.id,
      transaction: t,
    });

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
  {
    ignoreWorkspaceLimit = false,
  }: {
    ignoreWorkspaceLimit?: boolean;
  } = {}
): Promise<
  Result<
    SpaceResource,
    DustError<
      | "limit_reached"
      | "space_already_exists"
      | "internal_error"
      | "invalid_request_error"
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
  const { name: rawName, isRestricted, spaceKind, managementMode } = params;
  const name = rawName.trim();

  if (
    spaceKind === "project" &&
    isDatabaseFileSystemPodName(name) &&
    !(await hasFeatureFlag(auth, "dust_filesystem"))
  ) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The database-backed filesystem is not enabled for this workspace."
      )
    );
  }

  const result = await withTransaction(async (t) => {
    await getWorkspaceAdministrationVersionLock(owner, t);

    const all = await SpaceResource.listWorkspaceSpaces(auth, undefined, t);
    const isLimitReached = isPrivateSpacesLimitReached(
      all.map((v) => v.toJSON()),
      plan
    );

    if (isLimitReached && !ignoreWorkspaceLimit && spaceKind !== "project") {
      return new Err(
        new DustError(
          "limit_reached",
          "The maximum number of spaces has been reached."
        )
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

    let membersGroup: GroupResource;
    try {
      membersGroup = await GroupResource.makeNew(
        {
          name: `${spaceKind === "project" ? PROJECT_GROUP_PREFIX : SPACE_GROUP_PREFIX} ${name}`,
          workspaceId: owner.id,
          kind: "regular_auto",
        },
        { transaction: t }
      );
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        return new Err(
          new DustError(
            "space_already_exists",
            "This pod name is already used."
          )
        );
      }
      throw err;
    }

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
          kind: "regular_auto",
        },
        { transaction: t, memberIds: [creator.id] }
      );
      editorGroups.push(editorGroup);
    }

    const space = await SpaceResource.makeNew(
      auth,
      {
        name,
        kind: spaceKind,
        managementMode,
        workspaceId: owner.id,
      },
      { members: [membersGroup], editors: editorGroups },
      t
    );

    // The space's member groups, accumulated as associations are added. Passed (alongside
    // `editorGroups`) to `writeGroupPermissions` below so it does not rely on `this.groups`. The
    // project viewer group (the global group) goes here, since only editors need to be told apart.
    const memberGroups: GroupResource[] = [membersGroup];

    if (!isRestricted) {
      // Include the global group so the space's grants mark it as open (viewer for projects,
      // member for regular spaces); the grant is written by `writeGroupPermissions` below.
      assert(globalGroup, "Global group must exist");
      memberGroups.push(globalGroup);
    }

    // Handle member-based space creation
    switch (managementMode) {
      case "manual":
        if (spaceKind === "project") {
          assert(
            params.memberIds.length === 0,
            "Cannot add members to Pods on creation."
          );
          break;
        }

        // Seeding a regular space's members requires administering it. The member
        // group is a regular_auto group whose permissions are not checked directly,
        // so gate on the space instead.
        if (!auth.can("admin", space)) {
          return new Err(
            new DustError(
              "unauthorized",
              "Only admins can change group members"
            )
          );
        }

        // Add members to the member group in regular spaces
        const users = (await UserResource.fetchByIds(params.memberIds)).map(
          (user) => user.toJSON()
        );
        const groupsResult = await membersGroup.dangerouslyAddMembers(auth, {
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
          // Associating groups requires administering the space.
          if (!auth.can("admin", space)) {
            return new Err(
              new DustError(
                "unauthorized",
                "Only admins can change group members"
              )
            );
          }
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
          // `fetchByIds` only checks that the caller can read the groups, not what they are. Keep
          // internal groups (global, system, another space's regular_auto, agent/skill editors) out
          // of a space's group-managed access.
          if (selectedGroups.some((g) => !isManageableGroupKind(g.kind))) {
            return new Err(
              new DustError(
                "invalid_request_error",
                "Only provisioned and manual groups can be given access to a space."
              )
            );
          }
          memberGroups.push(...selectedGroups);
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

    // Write group_permissions once all group associations are in place (#9478). `makeNew` already
    // wrote the initial member/editor groups; this captures any added afterwards (global viewer,
    // group-mode selections).
    await space.writeGroupPermissions(auth, {
      members: memberGroups,
      editors: editorGroups,
      transaction: t,
    });

    return new Ok(space);
  });

  if (result.isOk()) {
    // Creating the space wrote `group_permissions` and, for projects, added the creator to the new
    // editor group, so the group set and grants `auth` resolved at construction are now stale.
    // Refresh the caller's snapshot now that the write has committed (no transaction, so the re-read
    // sees the committed rows and the `afterCommit`-invalidated cache), so later permission checks in
    // this request see the new access instead of a pre-creation view.
    await auth.refresh();

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
          "Failed to create dust_project connector for Pod, but space was created"
        );
        // Don't fail space creation if connector creation fails
        // The connector can be created later if needed
      }
    }
  }
  return result;
}

export async function listSpaceMemberGroupIds(
  auth: Authenticator,
  { spaceIds }: { spaceIds: string[] }
): Promise<string[]> {
  const spaces = await SpaceResource.fetchByIds(auth, spaceIds);
  const spaceMemberGroups = await SpaceResource.listMemberGroupsForSpaces(
    auth,
    spaces
  );

  return spaceMemberGroups.map(({ memberGroup }) => memberGroup.sId);
}
