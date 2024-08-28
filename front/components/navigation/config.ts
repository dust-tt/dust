import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  DocumentTextIcon,
  FolderOpenIcon,
  PlanetIcon,
  PuzzleIcon,
  QuestionMarkCircleIcon,
  RobotIcon,
  ShapesIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { GlobeAltIcon } from "@dust-tt/sparkle";
import type { AppType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { isAdmin, isBuilder, isUser } from "@dust-tt/types";
import { UsersIcon } from "@heroicons/react/20/solid";

/**
 * NavigationIds are typed ids we use to identify which navigation item is currently active. We need
 * ones for the topNavigation (same across the whole app) and for the subNavigation which appears in
 * some section of the app in the AppLayout navigation panel.
 */
export type TopNavigationId =
  | "conversations"
  | "assistants"
  | "admin"
  | "data_sources";

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
  | "documentation"
  | "community"
  | "vaults";

export type SubNavigationAdminId = "subscription" | "workspace" | "members";

export type SubNavigationAppId =
  | "specification"
  | "datasets"
  | "execute"
  | "runs"
  | "settings";

export type AppLayoutNavigation = {
  id:
    | TopNavigationId
    | SubNavigationConversationsId
    | SubNavigationAssistantsId
    | SubNavigationAdminId
    | SubNavigationAppId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  target?: string;
  hideLabel?: boolean;
  sizing?: "hug" | "expand";
  hasSeparator?: boolean;
  current: boolean;
  subMenuLabel?: string;
  subMenu?: AppLayoutNavigation[];
};

export type TabAppLayoutNavigation = {
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
  current?: never;
  isCurrent: (currentRoute: string) => boolean;
  subMenuLabel?: string;
  subMenu?: AppLayoutNavigation[];
};

export type SidebarNavigation = {
  id: "assistants" | "data_sources" | "workspace" | "developers" | "help";
  label: string | null;
  variant: "primary" | "secondary";
  menus: AppLayoutNavigation[];
};

export const getTopNavigationTabs = (owner: WorkspaceType) => {
  const nav: TabAppLayoutNavigation[] = [];

  nav.push({
    id: "conversations",
    label: "Chat",
    href: `/w/${owner.sId}/assistant/new`,
    icon: ChatBubbleLeftRightIcon,
    sizing: "expand",
    isCurrent: (currentRoute) =>
      ["/w/[wId]/assistant/new", "/w/[wId]/assistant/[cId]"].includes(
        currentRoute
      ),
  });

  if (isBuilder(owner)) {
    nav.push({
      id: "assistants",
      label: "Build",
      icon: PuzzleIcon,
      href: `/w/${owner.sId}/builder/assistants`,
      isCurrent: (currentRoute: string) =>
        currentRoute.startsWith("/w/[wId]/builder/") ||
        currentRoute === "/w/[wId]/a",
      sizing: "expand",
    });
  }

  if (owner.flags.includes("data_vaults_feature")) {
    nav.push({
      id: "data_sources",
      label: "Data sources",
      icon: BookOpenIcon,
      href: `/w/${owner.sId}/data-sources/vaults`,
      isCurrent: (currentRoute: string) =>
        currentRoute.startsWith("/w/[wId]/data-sources/vaults/"),
      sizing: "expand",
    });
  }

  if (isAdmin(owner)) {
    nav.push({
      id: "settings",
      label: "Admin",
      hideLabel: true,
      icon: Cog6ToothIcon,
      href: `/w/${owner.sId}/members`,
      isCurrent: (currentRoute) =>
        [
          "/w/[wId]/members",
          "/w/[wId]/workspace",
          "/w/[wId]/subscription",
        ].includes(currentRoute),
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
  subMenu?: AppLayoutNavigation[];
}) => {
  const nav: SidebarNavigation[] = [];

  const assistantMenus: AppLayoutNavigation[] = [];

  assistantMenus.push({
    id: "workspace_assistants",
    label: "Manage Assistants",
    icon: RobotIcon,
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

  const dataSourceItems: AppLayoutNavigation[] = [
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
    {
      id: "data_sources_url",
      label: "Websites",
      icon: GlobeAltIcon,
      href: `/w/${owner.sId}/builder/data-sources/public-urls`,
      current: current === "data_sources_url",
      subMenuLabel: current === "data_sources_url" ? subMenuLabel : undefined,
      subMenu: current === "data_sources_url" ? subMenu : undefined,
    },
  ];

  nav.push({
    id: "data_sources",
    label: "Data Sources",
    variant: "secondary",
    menus: dataSourceItems,
  });

  nav.push({
    id: "developers",
    label: "Developers",
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

  nav.push({
    id: "help",
    label: "Resources",
    variant: "secondary",
    menus: [
      {
        id: "documentation",
        label: "Documentation",
        icon: QuestionMarkCircleIcon,
        href: `https://docs.dust.tt`,
        current: current === "documentation",
        target: "_blank",
      },
      {
        id: "community",
        label: "Community Support",
        icon: UserGroupIcon,
        href: `https://community.dust.tt`,
        current: current === "community",
        target: "_blank",
      },
    ],
  });

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
  subMenu?: AppLayoutNavigation[];
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
  let nav: AppLayoutNavigation[] = [
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
