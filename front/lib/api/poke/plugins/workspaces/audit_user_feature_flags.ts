import { createPlugin } from "@app/lib/api/poke/types";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import {
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";
import { Err, Ok } from "@app/types/shared/result";

export const auditUserFeatureFlagsPlugin = createPlugin({
  manifest: {
    id: "audit-user-feature-flags",
    name: "Audit User Feature Flags",
    description:
      "Look up which feature flags a specific user has access to in this workspace, " +
      "including whether each flag is workspace-wide or group-scoped.",
    resourceTypes: ["workspaces"],
    readonly: true,
    args: {
      userId: {
        type: "string",
        label: "User sId",
        description: "The sId of the user to audit.",
      },
    },
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const userId = args.userId.trim();

    if (!userId) {
      return new Err(new Error("User sId is required."));
    }

    const user = await UserResource.fetchById(userId);
    if (!user) {
      return new Err(new Error(`User not found for sId: ${userId}`));
    }

    // Get the user's groups in this workspace.
    const userGroups = await GroupResource.listUserGroupsInWorkspace({
      user,
      workspace,
    });
    const userGroupIds = new Set(userGroups.map((g) => g.id));
    const userGroupNameMap = new Map(userGroups.map((g) => [g.id, g.name]));

    // Get all feature flags for the workspace.
    const flags = await FeatureFlagResource.listForWorkspace(workspace);

    // Resolve group names for group-scoped flags.
    const allGroupIds = new Set<number>();
    for (const f of flags) {
      if (f.groupIds) {
        for (const gId of f.groupIds) {
          allGroupIds.add(gId);
        }
      }
    }

    const flagGroupNameMap = new Map<number, string>();
    if (allGroupIds.size > 0) {
      const groups = await GroupResource.fetchByModelIds(auth, [
        ...allGroupIds,
      ]);
      for (const g of groups) {
        flagGroupNameMap.set(g.id, g.name);
      }
    }

    // Build the audit report.
    const lines: string[] = [];
    lines.push(`## Feature Flag Audit for \`${user.email ?? userId}\``);
    lines.push(`**Workspace:** ${workspace.name}`);
    lines.push(
      `**User groups:** ${userGroups.map((g) => g.name).join(", ") || "none"}`
    );
    lines.push("");

    const enabledForUser: string[] = [];
    const notEnabledForUser: string[] = [];

    for (const flag of flags) {
      const config = isWhitelistableFeature(flag.name)
        ? WHITELISTABLE_FEATURES_CONFIG[flag.name]
        : null;
      const description = config?.description ?? "";

      if (flag.groupIds === null) {
        // Workspace-wide flag — all users have it.
        enabledForUser.push(
          `- ✅ **${flag.name}** — workspace-wide${description ? ` — _${description}_` : ""}`
        );
      } else {
        // Group-scoped flag — check if user is in any of the groups.
        const matchingGroups = flag.groupIds.filter((gId) =>
          userGroupIds.has(gId)
        );
        const flagGroupNames = flag.groupIds.map(
          (gId) =>
            flagGroupNameMap.get(gId) ??
            userGroupNameMap.get(gId) ??
            `Unknown (${gId})`
        );

        if (matchingGroups.length > 0) {
          const matchingNames = matchingGroups.map(
            (gId) =>
              flagGroupNameMap.get(gId) ??
              userGroupNameMap.get(gId) ??
              `Unknown (${gId})`
          );
          enabledForUser.push(
            `- ✅ **${flag.name}** — via groups: ${matchingNames.join(", ")}${description ? ` — _${description}_` : ""}`
          );
        } else {
          notEnabledForUser.push(
            `- ❌ **${flag.name}** — requires groups: ${flagGroupNames.join(", ")}${description ? ` — _${description}_` : ""}`
          );
        }
      }
    }

    if (enabledForUser.length > 0) {
      lines.push(`### Flags enabled for this user (${enabledForUser.length})`);
      lines.push(...enabledForUser);
      lines.push("");
    }

    if (notEnabledForUser.length > 0) {
      lines.push(
        `### Flags enabled for workspace but NOT for this user (${notEnabledForUser.length})`
      );
      lines.push(...notEnabledForUser);
      lines.push("");
    }

    if (flags.length === 0) {
      lines.push("_No feature flags are enabled for this workspace._");
    }

    return new Ok({
      display: "markdown",
      value: lines.join("\n"),
    });
  },
});
