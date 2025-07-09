import { createPlugin } from "@app/lib/api/poke/types";
import { mergeUserIdentities } from "@app/lib/iam/users";
import { Err, Ok } from "@app/types";

export const userIdentityMergePlugin = createPlugin({
  manifest: {
    id: "merge-user-identities",
    name: "Merge user identities",
    description:
      "Merge two user identities with the same email (or not) into a single identity, " +
      "consolidating all related data.",
    resourceTypes: ["workspaces"],
    args: {
      primaryUserId: {
        type: "string",
        label: "Primary user ID",
        description:
          "User ID of the primary user (the one that will remain after the merge - likely the one with all the conversations history)",
      },
      secondaryUserId: {
        type: "string",
        label: "Secondary user ID",
        description:
          "User ID of the secondary user (the one that won't be kept after the merge - likely the new SSO one)",
      },
      ignoreEmailMatch: {
        type: "boolean",
        label: "Ignore email match",
        description:
          "If true, the secondary user's email will not be checked against the primary user's email.",
        default: false,
      },
      revokeSecondaryUser: {
        type: "boolean",
        label: "Revoke secondary user",
        description:
          "If true, the secondary user will be revoked from the workspace after the merge.",
        default: false,
      },
      skipAuth0: {
        type: "boolean",
        label: "Skip Auth0",
        description: "If true, the Auth0 merge will be skipped.",
        default: false,
      },
    },
  },
  execute: async (auth, _, args) => {
    const primaryUserId = args.primaryUserId.trim();
    const secondaryUserId = args.secondaryUserId.trim();

    if (primaryUserId.length === 0 || secondaryUserId.length === 0) {
      return new Err(new Error("Primary and secondary user IDs are required."));
    }

    const mergeResult = await mergeUserIdentities({
      auth,
      primaryUserId,
      secondaryUserId,
      enforceEmailMatch: !args.ignoreEmailMatch,
      revokeSecondaryUser: args.revokeSecondaryUser,
      skipAuth0: args.skipAuth0,
    });

    if (mergeResult.isErr()) {
      return new Err(mergeResult.error);
    }

    return new Ok({
      display: "text",
      value: `User identities successfully merged into primary identity with email: ${mergeResult.value.primaryUser.email}`,
    });
  },
});
