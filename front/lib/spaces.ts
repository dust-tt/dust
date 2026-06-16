import { MCP_SPECIFICATION } from "@app/lib/actions/utils_ui";
import type { DataSourceViewCategory } from "@app/types/api/public/spaces";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { SpaceType } from "@app/types/space";
import {
  Building04,
  CloudArrowLeftRight,
  Cube01,
  CubeOutline,
  Folder,
  Globe01,
  Lock01,
  Server03,
  Terminal,
  Zap,
} from "@dust-tt/sparkle";
import type React from "react";

export type { SpaceSectionGroupType } from "@app/lib/spaces_utils";
// Re-export non-UI utilities for backward compatibility.
export {
  dustAppsListUrl,
  getSpaceName,
  groupSpacesForDisplay,
  isPrivateSpacesLimitReached,
} from "@app/lib/spaces_utils";

export function getSpaceIcon(
  space: SpaceType
): (props: React.SVGProps<SVGSVGElement>) => React.ReactElement {
  if (space.kind === "project") {
    return space.isRestricted ? CubeOutline : Cube01;
  }

  if (space.isRestricted) {
    return Lock01;
  }

  if (space.kind === "global") {
    return Building04;
  }

  return Server03;
}

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
    icon: CloudArrowLeftRight,
  },
  folder: {
    label: "Folders",
    icon: Folder,
  },
  website: {
    label: "Websites",
    icon: Globe01,
  },
  apps: {
    label: "Apps",
    icon: Terminal,
    flag: "legacy_dust_apps",
  },
  actions: {
    label: "Tools",
    icon: MCP_SPECIFICATION.cardIcon,
  },
  triggers: {
    label: "Triggers",
    icon: Zap,
  },
};
