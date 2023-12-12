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
  RobotSharedIcon,
  ServerIcon,
  ShapesIcon,
} from "@dust-tt/sparkle";
import { WorkspaceType } from "@dust-tt/types";
import { AppType } from "@dust-tt/types";
import { UsersIcon } from "@heroicons/react/20/solid";

import { isDevelopmentOrDustWorkspace } from "@app/lib/development";

/**
 * NavigationIds are typed ids we use to identify which navigation item is currently active. We need
 * ones for the topNavigation (same across the whole app) and for the subNavigation which appears in
 * some section of the app in the AppLayout navigation panel.
 */
export type TopNavigationId = "conversations" | "assistants" | "admin";

export type SubNavigationAdminId =
  | "data_sources_managed"
  | "data_sources_static"
  | "subscription"
  | "workspace"
  | "members"
  | "developers"
  | "workspace_assistants"
  | "personal_assistants"
  | "extract"
  | "databases";
export type SubNavigationDataSourceId = "documents" | "search" | "settings";
export type SubNavigationAppId =
  | "specification"
  | "datasets"
  | "execute"
  | "runs"
  | "settings";
export type SubNavigationLabId = "extract" | "databases";

export type SparkleAppLayoutNavigation = {
  id:
    | TopNavigationId
    | SubNavigationAdminId
    | SubNavigationDataSourceId
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
    label: "Conversations",
    href: `/w/${owner.sId}/assistant/new`,
    icon: ChatBubbleLeftRightIcon,
    sizing: "expand",
    current: current === "conversations",
  });

  if (owner.role === "admin" || owner.role === "builder") {
    nav.push({
      id: "assistants",
      label: "Assistants",
      hideLabel: true,
      icon: RobotSharedIcon,
      href: `/w/${owner.sId}/builder/assistants`,
      current: current === "assistants",
      sizing: "hug",
    });
    nav.push({
      id: "settings",
      label: "Admin",
      hideLabel: true,
      icon: Cog6ToothIcon,
      href:
        owner.role === "admin"
          ? `/w/${owner.sId}/workspace`
          : `/w/${owner.sId}/a`,
      current: current === "admin",
      sizing: "hug",
    });
  }

  return nav;
};

export const subNavigationConversations = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  owner,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  current,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subMenuLabel,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subMenu,
}: {
  owner: WorkspaceType;
  current: SubNavigationAdminId;
  subMenuLabel?: string;
  subMenu?: SparkleAppLayoutNavigation[];
}) => {
  const nav: SidebarNavigation[] = [];

  // To be added for personal assistants view.

  // nav.push({
  //   id: "assistants",
  //   label: null,
  //   variant: "secondary",
  //   menus: [
  //     {
  //       id: "personal_assistants",
  //       label: "My Assistants",
  //       icon: RobotIcon,
  //       href: `/w/${owner.sId}/builder/assistants`,
  //       current: current === "personal_assistants",
  //       subMenuLabel:
  //         current === "personal_assistants" ? subMenuLabel : undefined,
  //       subMenu: current === "personal_assistants" ? subMenu : undefined,
  //     },
  //   ],
  // });

  return nav;
};

export const subNavigationAssistants = ({
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

  nav.push({
    id: "assistants",
    label: null,
    variant: "secondary",
    menus: [
      {
        id: "workspace_assistants",
        label: "Workspace Assistants",
        icon: RobotSharedIcon,
        href: `/w/${owner.sId}/builder/assistants`,
        current: current === "workspace_assistants",
        subMenuLabel:
          current === "workspace_assistants" ? subMenuLabel : undefined,
        subMenu: current === "workspace_assistants" ? subMenu : undefined,
      },
    ],
  });

  nav.push({
    id: "data_sources",
    label: "Data Sources",
    variant: "secondary",
    menus: [
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
  subMenu?: SparkleAppLayoutNavigation[];
}) => {
  const nav: SidebarNavigation[] = [];

  if (owner.role !== "admin" && owner.role !== "builder") {
    return nav;
  }

  if (owner.role === "admin") {
    nav.push({
      id: "workspace",
      label: null,
      variant: "secondary",
      menus: [
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
        {
          id: "members",
          label: "Members",
          icon: UsersIcon,
          href: `/w/${owner.sId}/members`,
          current: current === "members",
          subMenuLabel: current === "members" ? subMenuLabel : undefined,
          subMenu: current === "members" ? subMenu : undefined,
        },
      ],
    });
  }

  nav.push({
    id: "developers",
    label: owner.role === "admin" ? "Developers" : null,
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
        {
          id: "databases",
          label: "Databases",
          icon: ServerIcon,
          href: `/w/${owner.sId}/databases`,
          current: current === "databases",
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

  if (
    owner.role === "user" ||
    owner.role === "builder" ||
    owner.role === "admin"
  ) {
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
