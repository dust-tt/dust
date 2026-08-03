import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { removeNulls } from "@app/types/shared/utils/general";
import * as fs from "fs";
import * as readline from "readline";

makeScript(
  {
    workspaceId: {
      type: "string",
      alias: "w",
      description: "Workspace sId",
      demandOption: true,
    },
    csvPath: {
      type: "string",
      alias: "f",
      description:
        "Path to the CSV file (columns: email, userId, groupId, groupName)",
      demandOption: true,
    },
  },
  async ({ workspaceId, csvPath, execute }, scriptLogger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspace = auth.getNonNullableWorkspace();

    // Parse CSV: groupId may contain commas as thousand separators and be quoted.
    const rows: { userId: string; groupModelId: number; groupName: string }[] =
      [];

    const fileStream = fs.createReadStream(csvPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });
    let isHeader = true;
    for await (const line of rl) {
      if (isHeader) {
        isHeader = false;
        continue;
      }
      if (!line.trim()) {
        continue;
      }
      // The groupId column can be a quoted string with comma thousand-separators,
      // e.g. `"274,878,006,280"`. We parse the whole line by splitting on the
      // first and last comma-delimited fields, then reconstruct the groupId.
      //
      // Format: email,userId,"groupId",groupName  (groupId may or may not be quoted)
      // Split on commas but handle quoted fields.
      const parts: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          parts.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
      parts.push(current);

      if (parts.length < 4) {
        scriptLogger.warn({ line }, "Skipping malformed line");
        continue;
      }

      const userId = parts[1].trim();
      // Remove thousand-separator commas from groupId.
      const rawGroupId = parts[2].trim().replace(/,/g, "");
      const groupModelId = parseInt(rawGroupId, 10);
      const groupName = parts.slice(3).join(",").trim();

      if (isNaN(groupModelId)) {
        scriptLogger.warn(
          { line, rawGroupId },
          "Skipping line: invalid groupId"
        );
        continue;
      }

      rows.push({ userId, groupModelId, groupName });
    }

    scriptLogger.info(
      { rowCount: rows.length, workspaceId },
      "Parsed CSV rows"
    );

    // Deduplicate and group by groupModelId.
    const groupIdToUserIds = new Map<number, Set<string>>();
    for (const row of rows) {
      const set = groupIdToUserIds.get(row.groupModelId) ?? new Set<string>();
      set.add(row.userId);
      groupIdToUserIds.set(row.groupModelId, set);
    }

    // Fetch all distinct users upfront.
    const allUserIds = [...new Set(rows.map((r) => r.userId))];
    const users = await UserResource.fetchByIds(allUserIds);

    // Only process users who are currently active workspace members.
    const activeUsers = (
      await MembershipResource.getActiveMemberships({
        users,
        workspace,
      })
    ).memberships.map((m) => m.userId);
    const activeUserModelIds = new Set(activeUsers);
    const activeUsersBySId = new Map(
      users.filter((u) => activeUserModelIds.has(u.id)).map((u) => [u.sId, u])
    );

    const skippedInactive = allUserIds.filter(
      (id) => !activeUsersBySId.has(id)
    );
    if (skippedInactive.length > 0) {
      scriptLogger.warn(
        { skippedInactive, workspaceId },
        "Skipping users who are not active workspace members (not yet re-provisioned)"
      );
    }

    // Fetch all target groups.
    const groups = await GroupResource.fetchByModelIds(auth, [
      ...groupIdToUserIds.keys(),
    ]);
    const groupByModelId = new Map(groups.map((g) => [g.id, g]));

    let totalRestored = 0;
    let totalSkipped = 0;

    for (const [groupModelId, userIdSet] of groupIdToUserIds) {
      const group = groupByModelId.get(groupModelId);
      if (!group) {
        scriptLogger.warn(
          { groupModelId, workspaceId },
          "Group not found, skipping"
        );
        totalSkipped += userIdSet.size;
        continue;
      }

      const usersForGroup = removeNulls(
        [...userIdSet].map((sId) => activeUsersBySId.get(sId))
      ).map((u) => u.toJSON());

      if (usersForGroup.length === 0) {
        scriptLogger.info(
          { groupId: group.sId, groupName: group.name, workspaceId },
          "No active users to restore for this group, skipping"
        );
        continue;
      }

      scriptLogger.info(
        {
          groupId: group.sId,
          groupName: group.name,
          users: usersForGroup.map((u) => u.sId),
          workspaceId,
        },
        execute ? "Restoring members" : "Dry run: would restore members"
      );

      if (execute) {
        if (!group.canWrite(auth)) {
          scriptLogger.error(
            { groupId: group.sId, groupName: group.name, workspaceId },
            "Unauthorized to add members to group, skipping"
          );
          totalSkipped += usersForGroup.length;
          continue;
        }

        const result = await group.dangerouslyAddMembers(auth, {
          users: usersForGroup,
          allowProvisionedGroups: true,
        });

        if (result.isErr()) {
          scriptLogger.error(
            {
              groupId: group.sId,
              groupName: group.name,
              error: result.error,
              workspaceId,
            },
            "Failed to restore members"
          );
          totalSkipped += usersForGroup.length;
        } else {
          totalRestored += usersForGroup.length;
        }
      } else {
        totalRestored += usersForGroup.length;
      }
    }

    scriptLogger.info(
      { totalRestored, totalSkipped, workspaceId },
      execute ? "Done" : "Dry run complete"
    );
  }
);
