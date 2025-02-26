import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { mergeUserIdentities } from "@app/lib/iam/users";

export const userIdentityMergePlugin = createPlugin({
  manifest: {
    id: "merge-user-identities",
    name: "Merge user identities",
    description:
      "Merge two user identities with the same email into a single identity, consolidating all related data.",
    resourceTypes: ["workspaces"],
    args: {
      primaryUserId: {
        type: "string",
        label: "Primary user ID",
        description:
          "User ID of the primary user (the one that will remain after the merge)",
      },
      secondaryUserId: {
        type: "string",
        label: "Secondary user ID",
        description:
          "User ID of the secondary user (the one that won't be kept after the merge)",
      },
    },
  },
  execute: async (auth, resourceId, args) => {
    const primaryUserId = args.primaryUserId.trim();
    const secondaryUserId = args.secondaryUserId.trim();

    if (primaryUserId.length === 0 || secondaryUserId.length === 0) {
      return new Err(new Error("Primary and secondary user IDs are required."));
    }

    const mergeResult = await mergeUserIdentities({
      auth,
      primaryUserId,
      secondaryUserId,
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
