import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
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

    // The global space's own member group, if it has one (see the member-group resolution in the
    // transaction below).
    const existingAutoGroups = await globalSpace.fetchRegularAutoGroups(auth);
    if (existingAutoGroups.length > 1) {
      scriptLogger.error(
        { groupIds: existingAutoGroups.map((group) => group.sId) },
        "The global space has more than one member group; resolve by hand."
      );
      return;
    }

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
            existingAutoGroups.length > 0
              ? `Rename member group "${existingAutoGroups[0].name}" to "${SPACE_GROUP_PREFIX} ${spaceName}"`
              : `Create member group "${SPACE_GROUP_PREFIX} ${spaceName}"`,
            `Link member group to the space`,
            ...(managementMode === "group" && groupIds
              ? [
                  `Link provisioned groups [${groupIds}] to the space`,
                  `Set managementMode to "group"`,
                ]
              : []),
            `Create new empty global space "${GLOBAL_SPACE_NAME}" with its member group "${SPACE_GROUP_PREFIX} ${GLOBAL_SPACE_NAME}"`,
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

      // The member group of the restricted space. The old global space already owns one (created
      // with the space, or by the `20260908_backfill_global_space_member_group` migration), named
      // after the global space; it is renamed and reused rather than left behind, because creating
      // a second `${SPACE_GROUP_PREFIX} ${GLOBAL_SPACE_NAME}` group for the new global space below
      // would collide with it on the unique (workspaceId, name) group index.
      const [existingMemberGroup] = existingAutoGroups;
      const memberGroup =
        existingMemberGroup ??
        (await GroupResource.makeNew(
          {
            name: `${SPACE_GROUP_PREFIX} ${spaceName}`,
            kind: "regular_auto",
            workspaceId: workspace.id,
          },
          { transaction: t }
        ));
      if (existingMemberGroup) {
        const renameRes = await memberGroup.dangerouslyUpdateName(
          `${SPACE_GROUP_PREFIX} ${spaceName}`
        );
        if (renameRes.isErr()) {
          throw renameRes.error;
        }
      }
      scriptLogger.info(
        {
          groupId: memberGroup.sId,
          groupName: memberGroup.name,
          reused: !!existingMemberGroup,
        },
        "Resolved member group"
      );

      const memberGroups: GroupResource[] = [memberGroup];

      // If group management mode, also attach the selected provisioned groups.
      if (managementMode === "group" && groupIds) {
        const groupIdsArray = groupIds.split(",").map((id) => id.trim());
        const groupsRes = await GroupResource.fetchByIds(auth, groupIdsArray);
        if (groupsRes.isErr()) {
          throw new Error(
            `Failed to fetch provisioned groups: ${groupsRes.error.message}`
          );
        }
        memberGroups.push(...groupsRes.value);
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

      // Rewrite the space's group_permissions for restricted access: drop the global group's grant
      // and grant the member (+ provisioned) groups. The space is now a restricted regular space,
      // where every group holds a `member` grant.
      await GroupPermissionResource.deleteAllForResource(auth, {
        resourceType: "space",
        resourceId: globalSpace.id,
        transaction: t,
      });
      for (const group of memberGroups) {
        await GroupPermissionResource.grant(auth, {
          group,
          grantType: "member",
          resourceType: "space",
          resourceId: globalSpace.id,
          transaction: t,
        });
      }
      scriptLogger.info(
        "Rewrote space group_permissions for restricted access"
      );

      // Create a new global space, with its own member group (whose `member` grant is what confers
      // write on the global space outside the admin/manager roles).
      const newGlobalSpaceMemberGroup =
        await SpaceResource.makeGlobalSpaceMemberGroup({
          workspaceId: workspace.id,
          spaceName: GLOBAL_SPACE_NAME,
          transaction: t,
        });
      const newGlobalSpace = await SpaceResource.makeNew(
        auth,
        {
          name: GLOBAL_SPACE_NAME,
          kind: "global",
          workspaceId: workspace.id,
        },
        { members: [globalGroup, newGlobalSpaceMemberGroup] },
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
