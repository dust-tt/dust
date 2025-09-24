import {
  BarChartIcon,
  BracesIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  DocumentTextIcon,
  FolderOpenIcon,
  GlobeAltIcon,
  LockIcon,
  PlanetIcon,
  ShapesIcon,
  UserIcon,
} from "@dust-tt/sparkle";

import type { AppType, WhitelistableFeature, WorkspaceType } from "@app/types";
import { isAdmin, isBuilder } from "@app/types";

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
  | "spaces";

export type SubNavigationAdminId =
  | "subscription"
  | "workspace"
  | "members"
  | "providers"
  | "api_keys"
  | "dev_secrets"
  | "analytics"
  | "actions";

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
  featureFlag?: WhitelistableFeature;
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
  ref?: React.RefObject<HTMLDivElement>;
};

export type SidebarNavigation = {
  id: "assistants" | "data_sources" | "workspace" | "developers" | "help";
  label: string | null;
  variant: "primary" | "secondary";
  menus: AppLayoutNavigation[];
};

export const getTopNavigationTabs = (
  owner: WorkspaceType,
  spaceMenuButtonRef: React.RefObject<HTMLDivElement>
) => {
  const nav: TabAppLayoutNavigation[] = [];

  nav.push({
    id: "conversations",
    label: "Chat",
    href: `/w/${owner.sId}/assistant/new`,
    icon: ChatBubbleLeftRightIcon,
    sizing: "hug",
    isCurrent: (currentRoute) =>
      [
        "/w/[wId]/assistant/new",
        "/w/[wId]/assistant/[cId]",
        "/w/[wId]/assistants",
      ].includes(currentRoute),
  });

  nav.push({
    id: "data_sources",
    label: "Spaces",
    icon: PlanetIcon,
    href: `/w/${owner.sId}/spaces`,
    isCurrent: (currentRoute: string) =>
      currentRoute.startsWith("/w/[wId]/spaces/"),
    sizing: "hug",
    ref: spaceMenuButtonRef,
  });

  if (isAdmin(owner)) {
    nav.push({
      id: "settings",
      label: "Admin",
      icon: Cog6ToothIcon,
      href: `/w/${owner.sId}/members`,
      isCurrent: (currentRoute) =>
        [
          "/w/[wId]/members",
          "/w/[wId]/workspace",
          "/w/[wId]/subscription",
          "/w/[wId]/analytics",
          "/w/[wId]/actions",
          "/w/[wId]/developers/providers",
          "/w/[wId]/developers/api-keys",
          "/w/[wId]/developers/dev-secrets",
        ].includes(currentRoute),
      sizing: "hug",
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
  subMenu?: AppLayoutNavigation[];
}) => {
  const nav: SidebarNavigation[] = [];

  if (!isBuilder(owner)) {
    return nav;
  }

  if (isAdmin(owner)) {
    nav.push({
      id: "workspace",
      label: "Workspace Management",
      variant: "primary",
      menus: [
        {
          id: "members",
          label: "People & Security",
          icon: UserIcon,
          href: `/w/${owner.sId}/members`,
          current: current === "members",
          subMenuLabel: current === "members" ? subMenuLabel : undefined,
          subMenu: current === "members" ? subMenu : undefined,
        },
        {
          id: "workspace",
          label: "Workspace Settings",
          icon: GlobeAltIcon,
          href: `/w/${owner.sId}/workspace`,
          current: current === "workspace",
          subMenuLabel: current === "workspace" ? subMenuLabel : undefined,
          subMenu: current === "workspace" ? subMenu : undefined,
        },
        {
          id: "analytics",
          label: "Analytics",
          icon: BarChartIcon,
          href: `/w/${owner.sId}/analytics`,
          current: current === "analytics",
          subMenuLabel: current === "analytics" ? subMenuLabel : undefined,
          subMenu: current === "analytics" ? subMenu : undefined,
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

    nav.push({
      id: "developers",
      label: "Builder Tools Management",
      variant: "primary",
      menus: [
        {
          id: "providers",
          label: "Providers",
          icon: ShapesIcon,
          href: `/w/${owner.sId}/developers/providers`,
          current: current === "providers",
          subMenuLabel: current === "providers" ? subMenuLabel : undefined,
          subMenu: current === "providers" ? subMenu : undefined,
        },
        {
          id: "api_keys",
          label: "API Keys",
          icon: LockIcon,
          href: `/w/${owner.sId}/developers/api-keys`,
          current: current === "api_keys",
          subMenuLabel: current === "api_keys" ? subMenuLabel : undefined,
          subMenu: current === "api_keys" ? subMenu : undefined,
        },
        {
          id: "dev_secrets",
          label: "Secrets",
          icon: BracesIcon,
          href: `/w/${owner.sId}/developers/dev-secrets`,
          current: current === "dev_secrets",
          subMenuLabel: current === "dev_secrets" ? subMenuLabel : undefined,
          subMenu: current === "dev_secrets" ? subMenu : undefined,
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
  let nav = [
    {
      value: "specification",
      label: "Specification",
      icon: CommandLineIcon,
      href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}`,
      current: current === "specification",
    },
    {
      value: "datasets",
      label: "Datasets",
      icon: DocumentTextIcon,
      href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets`,
      current: current === "datasets",
    },
  ];

  if (isAdmin(owner) || isBuilder(owner)) {
    nav = nav.concat([
      {
        value: "runs",
        label: "Logs",
        icon: FolderOpenIcon,
        href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs`,
        current: current === "runs",
      },
      {
        value: "settings",
        label: "Settings",
        icon: Cog6ToothIcon,
        href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/settings`,
        current: current === "settings",
      },
    ]);
  }

  return nav;
};
