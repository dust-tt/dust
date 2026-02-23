import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { GLOBAL_SPACE_NAME, SPACE_GROUP_PREFIX } from "@app/types/groups";

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "Target workspace sId",
      type: "string",
      demandOption: true,
    },
    spaceName: {
      alias: "n",
      describe:
        "New name for the restricted space (since the new global space takes 'Company Data')",
      type: "string",
      demandOption: true,
    },
    managementMode: {
      alias: "m",
      describe: "Management mode for the restricted space: 'manual' or 'group'",
      type: "string",
      choices: ["manual", "group"],
      default: "manual",
    },
    groupIds: {
      alias: "g",
      describe:
        "Comma-separated group sIds to add as members (for group management mode)",
      type: "string",
    },
  },
  async (
    { managementMode, groupIds, workspaceId, spaceName, execute },
    scriptLogger
  ) => {
    if (managementMode !== "manual" && managementMode !== "group") {
      throw new Error(
        `Invalid managementMode: ${managementMode}. Must be 'manual' or 'group'.`
      );
    }

    if (managementMode === "group" && !groupIds) {
      throw new Error(
        "When using group management mode, --groupIds is required."
      );
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspace = auth.getNonNullableWorkspace();

    // Find the global space.
    const defaultSpaces = await SpaceResource.listWorkspaceDefaultSpaces(auth);
    const globalSpace = defaultSpaces.find((s) => s.isGlobal());

    if (!globalSpace) {
      scriptLogger.error("No global space found.");
      return;
    }

    scriptLogger.info(
      { spaceId: globalSpace.sId, spaceName: globalSpace.name },
      "Found global space"
    );

    // Check that the new space name is available.
    const nameAvailable = await SpaceResource.isNameAvailable(auth, spaceName);
    if (!nameAvailable) {
      scriptLogger.error({ spaceName }, "Space name is already taken.");
      return;
    }

    // Fetch the global group.
    const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (globalGroupRes.isErr()) {
      scriptLogger.error("Failed to fetch global group.");
      return;
    }
    const globalGroup = globalGroupRes.value;

    // Count data source views in the current global space for summary.
    const dataSourceViews = await DataSourceViewModel.findAll({
      where: {
        workspaceId: workspace.id,
        vaultId: globalSpace.id,
      },
      attributes: ["id"],
    });
    const dataSourceViewCount = dataSourceViews.length;

    scriptLogger.info(
      {
        dataSourceViewCount,
        globalGroupId: globalGroup.sId,
        managementMode,
      },
      "Pre-flight summary"
    );

    if (!execute) {
      scriptLogger.info(
        {
          actions: [
            `Rename global space "${globalSpace.name}" to "${spaceName}"`,
            `Change space kind from "global" to "regular"`,
            `Remove global group from the space`,
            `Create member group "${SPACE_GROUP_PREFIX} ${spaceName}"`,
            `Link member group to the space`,
            ...(managementMode === "group" && groupIds
              ? [
                  `Link provisioned groups [${groupIds}] to the space`,
                  `Set managementMode to "group"`,
                ]
              : []),
            `Create new empty global space "${GLOBAL_SPACE_NAME}"`,
          ],
        },
        "DRY RUN — planned actions"
      );
      logger.warn(
        "WARNING: @dust agent will lose data access after this migration (by design)."
      );
      return;
    }

    // Execute the migration in a transaction.
    await withTransaction(async (t) => {
      // Rename the old space and change kind from "global" to "regular".
      await SpaceModel.update(
        { name: spaceName, kind: "regular" },
        {
          where: { id: globalSpace.id, workspaceId: workspace.id },
          transaction: t,
        }
      );
      scriptLogger.info(
        { from: globalSpace.name, to: spaceName },
        "Renamed space / changed kind to 'regular'"
      );

      // Remove the global group from the old space.
      await GroupSpaceModel.destroy({
        where: {
          groupId: globalGroup.id,
          vaultId: globalSpace.id,
          workspaceId: workspace.id,
        },
        transaction: t,
      });
      scriptLogger.info("Removed global group from the space");

      // Create a member group for the restricted space.
      const memberGroup = await GroupResource.makeNew(
        {
          name: `${SPACE_GROUP_PREFIX} ${spaceName}`,
          kind: "regular",
          workspaceId: workspace.id,
        },
        { transaction: t }
      );
      scriptLogger.info(
        { groupId: memberGroup.sId, groupName: memberGroup.name },
        "Created member group"
      );

      // Link the member group to the space.
      await GroupSpaceModel.create(
        {
          groupId: memberGroup.id,
          vaultId: globalSpace.id,
          workspaceId: workspace.id,
          kind: "member",
        },
        { transaction: t }
      );
      scriptLogger.info("Linked member group to the space");

      // If group management mode, link provisioned groups.
      if (managementMode === "group" && groupIds) {
        const groupSIds = groupIds.split(",").map((id) => id.trim());
        const groupsRes = await GroupResource.fetchByIds(auth, groupSIds);
        if (groupsRes.isErr()) {
          throw new Error(
            `Failed to fetch provisioned groups: ${groupsRes.error.message}`
          );
        }

        for (const group of groupsRes.value) {
          await GroupSpaceModel.create(
            {
              groupId: group.id,
              vaultId: globalSpace.id,
              workspaceId: workspace.id,
              kind: "member",
            },
            { transaction: t }
          );
          scriptLogger.info(
            { groupId: group.sId, groupName: group.name },
            "Linked provisioned group to the space"
          );
        }
      }

      // Update management mode if needed.
      if (managementMode === "group") {
        await SpaceModel.update(
          { managementMode: "group" },
          {
            where: { id: globalSpace.id, workspaceId: workspace.id },
            transaction: t,
          }
        );
        scriptLogger.info("Set managementMode to 'group'");
      }

      // Create a new global space.
      const newGlobalSpace = await SpaceResource.makeNew(
        {
          name: GLOBAL_SPACE_NAME,
          kind: "global",
          workspaceId: workspace.id,
        },
        { members: [globalGroup] },
        t
      );
      scriptLogger.info(
        { spaceId: newGlobalSpace.sId, spaceName: newGlobalSpace.name },
        "Created new global space"
      );

      // Step 13: Log summary.
      scriptLogger.info(
        {
          oldSpaceId: globalSpace.sId,
          oldSpaceName: spaceName,
          newGlobalSpaceId: newGlobalSpace.sId,
          dataSourceViewsInRestrictedSpace: dataSourceViewCount,
        },
        "Migration complete"
      );

      logger.warn(
        "WARNING: @dust agent now has no data sources (by design). " +
          "Users must be added to the restricted space to access existing data."
      );
    });
  }
);
