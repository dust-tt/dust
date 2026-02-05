import {
  BoltIcon,
  CloudArrowLeftRightIcon,
  CommandLineIcon,
  CompanyIcon,
  FolderIcon,
  GlobeAltIcon,
  LockIcon,
  ServerIcon,
  SpaceClosedIcon,
  SpaceOpenIcon,
} from "@dust-tt/sparkle";
import groupBy from "lodash/groupBy";
import type React from "react";

import { MCP_SPECIFICATION } from "@app/lib/actions/utils";
import type {
  DataSourceViewCategory,
  PlanType,
  SpaceType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import { GLOBAL_SPACE_NAME } from "@app/types";
import { assertNever } from "@app/types/shared/utils/assert_never";

const SPACE_SECTION_GROUP_ORDER = [
  "system",
  "shared",
  "restricted",
] as const;

export type SpaceSectionGroupType = (typeof SPACE_SECTION_GROUP_ORDER)[number];

export function getSpaceIcon(
  space: SpaceType
): (props: React.SVGProps<SVGSVGElement>) => React.ReactElement {
  if (space.kind === "project") {
    return space.isRestricted ? SpaceClosedIcon : SpaceOpenIcon;
  }

  if (space.isRestricted) {
    return LockIcon;
  }

  if (space.kind === "global") {
    return CompanyIcon;
  }

  return ServerIcon;
}

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

export const CATEGORY_DETAILS: {
  [key in DataSourceViewCategory]: {
    label: string;
    icon: React.ComponentType<{
      className?: string;
    }>;
    flag?: WhitelistableFeature;
  };
} = {
  managed: {
    label: "Connected Data",
    icon: CloudArrowLeftRightIcon,
  },
  folder: {
    label: "Folders",
    icon: FolderIcon,
  },
  website: {
    label: "Websites",
    icon: GlobeAltIcon,
  },
  apps: {
    label: "Apps",
    icon: CommandLineIcon,
    flag: "legacy_dust_apps",
  },
  actions: {
    label: "Tools",
    icon: MCP_SPECIFICATION.cardIcon,
  },
  triggers: {
    label: "Triggers",
    icon: BoltIcon,
  },
};
