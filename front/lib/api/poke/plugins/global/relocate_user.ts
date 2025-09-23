import { createPlugin } from "@app/lib/api/poke/types";
import type { RegionType } from "@app/lib/api/regions/config";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { UserResource } from "@app/lib/resources/user_resource";
import { Err, mapToEnumValues, normalizeError, Ok } from "@app/types";

export const relocateUserPlugin = createPlugin({
  manifest: {
    id: "relocate-user",
    name: "Relocate User to Another Region",
    description:
      "Relocate a user to another region by updating their WorkOS metadata.",
    resourceTypes: ["global"],
    args: {
      userId: {
        type: "string",
        label: "User ID",
        description: "The sId of the user to relocate",
      },
      newRegion: {
        type: "enum",
        label: "New Region",
        description: "The region to relocate the user to",
        async: false,
        values: mapToEnumValues(SUPPORTED_REGIONS, (region) => ({
          value: region,
          label:
            region === "us-central1"
              ? "US (us-central1)"
              : "Europe (europe-west1)",
        })),
        multiple: false,
      },
    },
  },
  execute: async (auth, _, args) => {
    const { userId, newRegion } = args;

    // Validate user ID
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      return new Err(new Error("User ID is required."));
    }

    // Validate region
    if (!SUPPORTED_REGIONS.includes(newRegion[0] as RegionType)) {
      return new Err(
        new Error(
          `Invalid region: ${newRegion[0]}. Supported regions: ${SUPPORTED_REGIONS.join(", ")}`
        )
      );
    }

    // Fetch the user
    const user = await UserResource.fetchById(userId.trim());
    if (!user) {
      return new Err(new Error(`User with ID ${userId} not found.`));
    }

    // Check if user has WorkOS ID
    if (!user.workOSUserId) {
      return new Err(
        new Error(
          `User ${userId} does not have a WorkOS ID. Cannot relocate user.`
        )
      );
    }

    try {
      // Update user's region metadata in WorkOS
      await getWorkOS().userManagement.updateUser({
        userId: user.workOSUserId,
        metadata: {
          region: newRegion[0] as RegionType,
        },
      });

      return new Ok({
        display: "text",
        value: `User ${user.email} (${userId}) successfully relocated to region ${newRegion[0]}.`,
      });
    } catch (error) {
      return new Err(
        new Error(
          `Failed to update user region in WorkOS: ${normalizeError(error).message}`
        )
      );
    }
  },
});
