import {
  ArrowUpOnSquareIcon,
  ChatBubbleLeftRightIcon,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  DocumentTextIcon,
  FolderOpenIcon,
  PaperAirplaneIcon,
  PlanetIcon,
  PuzzleIcon,
  RobotSharedIcon,
  ShapesIcon,
} from "@dust-tt/sparkle";
import { GlobeAltIcon } from "@dust-tt/sparkle";
import type { AppType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { isAdmin, isBuilder, isUser } from "@dust-tt/types";
import { UsersIcon } from "@heroicons/react/20/solid";

import {
  isActivatedPublicURLs,
  isDevelopmentOrDustWorkspace,
} from "@app/lib/development";

/**
 * NavigationIds are typed ids we use to identify which navigation item is currently active. We need
 * ones for the topNavigation (same across the whole app) and for the subNavigation which appears in
 * some section of the app in the AppLayout navigation panel.
 */
export type TopNavigationId = "conversations" | "assistants" | "admin";

export type SubNavigationConversationsId =
  | "conversation"
  | "personal_assistants";

export type SubNavigationAssistantsId =
  | "data_sources_managed"
  | "data_sources_static"
  | "workspace_assistants"
  | "personal_assistants"
  | "data_sources_url"
  | "developers"
  | "extract";

export type SubNavigationAdminId = "subscription" | "workspace" | "members";

export type SubNavigationAppId =
  | "specification"
  | "datasets"
  | "execute"
  | "runs"
  | "settings";
export type SubNavigationLabId = "extract";

export type SparkleAppLayoutNavigation = {
  id:
    | TopNavigationId
    | SubNavigationConversationsId
    | SubNavigationAssistantsId
    | SubNavigationAdminId
    | SubNavigationAppId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  hideLabel?: boolean;
  sizing?: "hug" | "expand";
  hasSeparator?: boolean;
  current: boolean;
  subMenuLabel?: string;
  subMenu?: SparkleAppLayoutNavigation[];
};

export type SidebarNavigation = {
  id: "assistants" | "data_sources" | "workspace" | "developers" | "lab";
  label: string | null;
  variant: "primary" | "secondary";
  menus: SparkleAppLayoutNavigation[];
};

export const topNavigation = ({
  owner,
  current,
}: {
  owner: WorkspaceType;
  current: TopNavigationId;
}) => {
  const nav: SparkleAppLayoutNavigation[] = [];

  nav.push({
    id: "conversations",
    label: "Chat",
    href: `/w/${owner.sId}/assistant/new`,
    icon: ChatBubbleLeftRightIcon,
    sizing: "expand",
    current: current === "conversations",
  });

  if (isBuilder(owner)) {
    nav.push({
      id: "assistants",
      label: "Build",
      icon: PuzzleIcon,
      href: `/w/${owner.sId}/builder/assistants`,
      current: current === "assistants",
      sizing: "expand",
    });
    nav.push({
      id: "settings",
      label: "Admin",
      hideLabel: true,
      icon: Cog6ToothIcon,
      href: isAdmin(owner) ? `/w/${owner.sId}/members` : `/w/${owner.sId}/a`,
      current: current === "admin",
      sizing: "hug",
    });
  }

  return nav;
};

export const subNavigationBuild = ({
  owner,
  current,
  subMenuLabel,
  subMenu,
}: {
  owner: WorkspaceType;
  current: SubNavigationAssistantsId;
  subMenuLabel?: string;
  subMenu?: SparkleAppLayoutNavigation[];
}) => {
  const nav: SidebarNavigation[] = [];

  const assistantMenus: SparkleAppLayoutNavigation[] = [];

  assistantMenus.push({
    id: "workspace_assistants",
    label: "Manage Assistants",
    icon: RobotSharedIcon,
    href: `/w/${owner.sId}/builder/assistants`,
    current: current === "workspace_assistants",
    subMenuLabel: current === "workspace_assistants" ? subMenuLabel : undefined,
    subMenu: current === "workspace_assistants" ? subMenu : undefined,
  });

  nav.push({
    id: "assistants",
    label: null,
    variant: "secondary",
    menus: assistantMenus,
  });

  const dataSourceItems: SparkleAppLayoutNavigation[] = [
    {
      id: "data_sources_managed",
      label: "Connections",
      icon: CloudArrowLeftRightIcon,
      href: `/w/${owner.sId}/builder/data-sources/managed`,
      current: current === "data_sources_managed",
      subMenuLabel:
        current === "data_sources_managed" ? subMenuLabel : undefined,
      subMenu: current === "data_sources_managed" ? subMenu : undefined,
    },
    {
      id: "data_sources_static",
      label: "Folders",
      icon: FolderOpenIcon,
      href: `/w/${owner.sId}/builder/data-sources/static`,
      current: current === "data_sources_static",
      subMenuLabel:
        current === "data_sources_static" ? subMenuLabel : undefined,
      subMenu: current === "data_sources_static" ? subMenu : undefined,
    },
  ];
  if (isActivatedPublicURLs(owner)) {
    dataSourceItems.push({
      id: "data_sources_url",
      label: "Websites",
      icon: GlobeAltIcon,
      href: `/w/${owner.sId}/builder/data-sources/public-urls`,
      current: current === "data_sources_url",
      subMenuLabel: current === "data_sources_url" ? subMenuLabel : undefined,
      subMenu: current === "data_sources_url" ? subMenu : undefined,
    });
  }
  nav.push({
    id: "data_sources",
    label: "Data Sources",
    variant: "secondary",
    menus: dataSourceItems,
  });

  nav.push({
    id: "developers",
    label: isAdmin(owner) ? "Developers" : null,
    variant: "secondary",
    menus: [
      {
        id: "developers",
        label: "Developer Tools",
        icon: CommandLineIcon,
        href: `/w/${owner.sId}/a`,
        current: current === "developers",
        subMenuLabel: current === "developers" ? subMenuLabel : undefined,
        subMenu: current === "developers" ? subMenu : undefined,
      },
    ],
  });

  if (isDevelopmentOrDustWorkspace(owner)) {
    nav.push({
      id: "lab",
      label: "Lab (Dust Only)",
      variant: "secondary",
      menus: [
        {
          id: "extract",
          label: "Extract",
          icon: ArrowUpOnSquareIcon,
          href: `/w/${owner.sId}/u/extract`,
          current: current === "extract",
        },
      ],
    });
  }

  return nav;
};

export const subNavigationAdmin = ({
  owner,
  current,
  subMenuLabel,
  subMenu,
}: {
  owner: WorkspaceType;
  current: SubNavigationAdminId;
  subMenuLabel?: string;
  subMenu?: SparkleAppLayoutNavigation[];
}) => {
  const nav: SidebarNavigation[] = [];

  if (!isBuilder(owner)) {
    return nav;
  }

  if (isAdmin(owner)) {
    nav.push({
      id: "workspace",
      label: null,
      variant: "secondary",
      menus: [
        {
          id: "members",
          label: "Members",
          icon: UsersIcon,
          href: `/w/${owner.sId}/members`,
          current: current === "members",
          subMenuLabel: current === "members" ? subMenuLabel : undefined,
          subMenu: current === "members" ? subMenu : undefined,
        },
        {
          id: "workspace",
          label: "Workspace",
          icon: PlanetIcon,
          href: `/w/${owner.sId}/workspace`,
          current: current === "workspace",
          subMenuLabel: current === "workspace" ? subMenuLabel : undefined,
          subMenu: current === "workspace" ? subMenu : undefined,
        },
        {
          id: "subscription",
          label: "Subscription",
          icon: ShapesIcon,
          href: `/w/${owner.sId}/subscription`,
          current: current === "subscription",
          subMenuLabel: current === "subscription" ? subMenuLabel : undefined,
          subMenu: current === "subscription" ? subMenu : undefined,
        },
      ],
    });
  }

  return nav;
};

export const subNavigationApp = ({
  owner,
  app,
  current,
}: {
  owner: WorkspaceType;
  app: AppType;
  current: SubNavigationAppId;
}) => {
  let nav: SparkleAppLayoutNavigation[] = [
    {
      id: "specification",
      label: "Specification",
      icon: CommandLineIcon,
      href: `/w/${owner.sId}/a/${app.sId}`,
      sizing: "expand",
      current: current === "specification",
    },
    {
      id: "datasets",
      label: "Datasets",
      icon: DocumentTextIcon,
      href: `/w/${owner.sId}/a/${app.sId}/datasets`,
      sizing: "expand",
      current: current === "datasets",
    },
  ];

  if (isUser(owner)) {
    nav = nav.concat([
      {
        id: "execute",
        label: "Run",
        icon: PaperAirplaneIcon,
        href: `/w/${owner.sId}/a/${app.sId}/execute`,
        sizing: "expand",
        current: current === "execute",
      },
      {
        id: "runs",
        label: "Logs",
        icon: FolderOpenIcon,
        href: `/w/${owner.sId}/a/${app.sId}/runs`,
        sizing: "expand",
        current: current === "runs",
      },
      {
        id: "settings",
        label: "Settings",
        icon: Cog6ToothIcon,
        href: `/w/${owner.sId}/a/${app.sId}/settings`,
        sizing: "expand",
        current: current === "settings",
      },
    ]);
  }

  return nav;
};
