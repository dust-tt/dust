import { MCP_SPECIFICATION } from "@app/lib/actions/utils_ui";
import type { DataSourceViewCategory } from "@app/types/api/public/spaces";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { SpaceType } from "@app/types/space";
import {
  Building04V2,
  CloudArrowLeftRightIcon,
  FolderV2,
  Globe01V2,
  Lock01V2,
  ServerIcon,
  SpaceClosedIcon,
  SpaceOpenIcon,
  TerminalV2,
  ZapV2,
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
    return space.isRestricted ? SpaceClosedIcon : SpaceOpenIcon;
  }

  if (space.isRestricted) {
    return Lock01V2;
  }

  if (space.kind === "global") {
    return Building04V2;
  }

  return ServerIcon;
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
    icon: CloudArrowLeftRightIcon,
  },
  folder: {
    label: "Folders",
    icon: FolderV2,
  },
  website: {
    label: "Websites",
    icon: Globe01V2,
  },
  apps: {
    label: "Apps",
    icon: TerminalV2,
    flag: "legacy_dust_apps",
  },
  actions: {
    label: "Tools",
    icon: MCP_SPECIFICATION.cardIcon,
  },
  triggers: {
    label: "Triggers",
    icon: ZapV2,
  },
};
