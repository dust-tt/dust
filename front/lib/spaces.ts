import { MCP_SPECIFICATION } from "@app/lib/actions/mcp_specification";
import type { DataSourceViewCategory } from "@app/types/api/public/spaces";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { SpaceType } from "@app/types/space";
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
import type React from "react";

export type { SpaceSectionGroupType } from "@app/lib/spaces_utils";
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
    return LockIcon;
  }

  if (space.kind === "global") {
    return CompanyIcon;
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
