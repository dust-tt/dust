import {
  BeakerIcon,
  BeakerStrokeIcon,
  ChatBubbleBottomCenterTextIcon,
  CloudArrowDownStrokeIcon,
  Cog6ToothIcon,
  Cog6ToothStrokeIcon,
  CommandLineStrokeIcon,
  DocumentTextStrokeIcon,
  FolderOpenStrokeIcon,
  MagnifyingGlassStrokeIcon,
  PaperAirplaneStrokeIcon,
} from "@dust-tt/sparkle";

import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { AppType } from "@app/types/app";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

/**
 * NavigationIds are typed ids we use to identify which navigation item is currently active. We need
 * ones for the topNavigation (same across the whole app) and for the subNavigation which appears in
 * some section of the app in the AppLayout navigation panel.
 */
export type TopNavigationId = "assistant" | "lab" | "settings";

export type SubNavigationAdminId = "data_sources" | "workspace" | "developers";
export type SubNavigationDataSourceId = "documents" | "search" | "settings";
export type SubNavigationAppId =
  | "specification"
  | "datasets"
  | "execute"
  | "runs"
  | "settings";
export type SubNavigationLabId = "gens" | "extract";

export type SparkleAppLayoutNavigation = {
  id:
    | TopNavigationId
    | SubNavigationAdminId
    | SubNavigationDataSourceId
    | SubNavigationAppId
    | SubNavigationLabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  hideLabel?: boolean;
  sizing?: "hug" | "expand";
  current: boolean;
};

export const topNavigation = (
  owner: WorkspaceType,
  current: TopNavigationId
) => {
  const nav: SparkleAppLayoutNavigation[] = [
    {
      id: "assistant",
      label: "Assistant",
      href: `/w/${owner.sId}/u/chat`,
      icon: ChatBubbleBottomCenterTextIcon,
      sizing: "expand",
      current: current === "assistant",
    },
  ];

  if (!owner.disableLabs) {
    nav.push({
      id: "lab",
      label: "Lab",
      icon: BeakerIcon,
      href: `/w/${owner.sId}/u/gens`,
      sizing: "expand",
      current: current === "lab",
    });
  }

  if (owner.role === "admin" || owner.role === "builder") {
    nav.push({
      id: "settings",
      label: "Settings",
      hideLabel: true,
      icon: Cog6ToothIcon,
      href: `/w/${owner.sId}/ds`,
      current: current === "settings",
    });
  }

  return nav;
};

export const subNavigationAdmin = (
  owner: WorkspaceType,
  current: SubNavigationAdminId
) => {
  const nav: SparkleAppLayoutNavigation[] = [
    {
      id: "data_sources",
      label: "Data Sources",
      icon: CloudArrowDownStrokeIcon,
      href: `/w/${owner.sId}/ds`,
      current: current === "data_sources",
    },
  ];

  if (owner.role === "admin") {
    nav.push({
      id: "workspace",
      label: "Workspace Settings",
      icon: Cog6ToothStrokeIcon,
      href: `/w/${owner.sId}/workspace`,
      current: current === "workspace",
    });
  }

  if (owner.role === "admin" || owner.role === "builder") {
    nav.push({
      id: "developers",
      label: "Developers Tools",
      icon: CommandLineStrokeIcon,
      href: `/w/${owner.sId}/a`,
      current: current === "developers",
    });
  }

  return nav;
};

export const subNavigationDataSource = (
  owner: WorkspaceType,
  dataSource: DataSourceType,
  current: SubNavigationDataSourceId
) => {
  const nav: SparkleAppLayoutNavigation[] = [
    {
      id: "documents",
      label: "Documents",
      icon: DocumentTextStrokeIcon,
      href: `/w/${owner.sId}/ds/${dataSource.name}`,
      current: current === "documents",
    },
  ];

  if (
    owner.role === "user" ||
    owner.role === "builder" ||
    owner.role === "admin"
  ) {
    nav.push({
      id: "search",
      label: "Search",
      icon: MagnifyingGlassStrokeIcon,
      href: `/w/${owner.sId}/ds/${dataSource.name}/search`,
      current: current === "search",
    });
  }

  if (
    owner.role === "admin" ||
    (owner.role === "builder" && !dataSource.connectorProvider)
  ) {
    nav.push({
      id: "settings",
      label: "Settings",
      icon: Cog6ToothStrokeIcon,
      href: `/w/${owner.sId}/ds/${dataSource.name}/settings`,
      current: current === "settings",
    });
  }

  return nav;
};

export const subNavigationApp = (
  owner: WorkspaceType,
  app: AppType,
  current: SubNavigationAppId
) => {
  let nav: SparkleAppLayoutNavigation[] = [
    {
      id: "specification",
      label: "Specification",
      icon: CommandLineStrokeIcon,
      href: `/w/${owner.sId}/a/${app.sId}`,
      current: current === "specification",
    },
    {
      id: "datasets",
      label: "Datasets",
      icon: DocumentTextStrokeIcon,
      href: `/w/${owner.sId}/a/${app.sId}/datasets`,
      current: current === "datasets",
    },
  ];

  if (
    owner.role === "user" ||
    owner.role === "builder" ||
    owner.role === "admin"
  ) {
    nav = nav.concat([
      {
        id: "execute",
        label: "Run",
        icon: PaperAirplaneStrokeIcon,
        href: `/w/${owner.sId}/a/${app.sId}/execute`,
        current: current === "execute",
      },
      {
        id: "runs",
        label: "Logs",
        icon: FolderOpenStrokeIcon,
        href: `/w/${owner.sId}/a/${app.sId}/runs`,
        current: current === "runs",
      },
      {
        id: "settings",
        label: "Settings",
        icon: Cog6ToothStrokeIcon,
        href: `/w/${owner.sId}/a/${app.sId}/settings`,
        current: current === "settings",
      },
    ]);
  }

  return nav;
};

export const subNavigationLab = (
  owner: WorkspaceType,
  current: SubNavigationLabId
) => {
  const nav: SparkleAppLayoutNavigation[] = [
    {
      id: "gens",
      label: "Gens",
      icon: BeakerStrokeIcon,
      href: `/w/${owner.sId}/u/gens`,
      current: current === "gens",
    },
  ];

  if (isDevelopmentOrDustWorkspace(owner)) {
    nav.push({
      id: "extract",
      label: "Extract",
      icon: BeakerStrokeIcon,
      href: `/w/${owner.sId}/u/extract`,
      current: current === "extract",
    });
  }

  return nav;
};
