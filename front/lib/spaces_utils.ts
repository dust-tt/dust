import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import type { PlanType } from "@app/types/plan";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import groupBy from "lodash/groupBy";

const SPACE_SECTION_GROUP_ORDER = ["system", "shared", "restricted"] as const;

export type SpaceSectionGroupType = (typeof SPACE_SECTION_GROUP_ORDER)[number];

export const getSpaceName = (space: SpaceType) => {
  return space.kind === "global" ? GLOBAL_SPACE_NAME : space.name;
};

export const dustAppsListUrl = (
  owner: WorkspaceType,
  space: SpaceType
): string => {
  return `/w/${owner.sId}/spaces/${space.sId}/categories/apps`;
};

export const groupSpacesForDisplay = (spaces: SpaceType[]) => {
  // Conversations space should never be displayed
  const spacesWithoutConversations = spaces.filter(
    (space) => space.kind !== "conversations"
  );
  // Group by kind and sort.
  const groupedSpaces = groupBy(
    spacesWithoutConversations,
    (space): SpaceSectionGroupType => {
      // please ts
      if (space.kind === "conversations") {
        throw new Error("Conversations space should never be displayed");
      }

      switch (space.kind) {
        case "system":
          return space.kind;

        case "global":
        case "regular":
        case "project":
          return space.isRestricted ? "restricted" : "shared";

        default:
          assertNever(space.kind);
      }
    }
  );

  return SPACE_SECTION_GROUP_ORDER.map((section) => ({
    section,
    spaces: groupedSpaces[section] || [],
  }));
};

export const isPrivateSpacesLimitReached = (
  spaces: SpaceType[],
  plan: PlanType
) =>
  plan.limits.vaults.maxVaults !== -1 &&
  spaces.filter((s) => s.kind === "regular").length >=
    plan.limits.vaults.maxVaults;
