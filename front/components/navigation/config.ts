import {
  BarChartIcon,
  BracesIcon,
  CardIcon,
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

import { getConversationRoute } from "@app/lib/utils/router";
import type { AppType, WhitelistableFeature, WorkspaceType } from "@app/types";
import { isAdmin, isBuilder } from "@app/types";

/**
 * Check if an actual route path matches any of the given route patterns.
 * Supports both Next.js patterns like "/w/[wId]/members" and actual paths like "/w/abc123/members".
 * @param currentRoute - The actual route path (e.g., "/w/abc123/members")
 * @param patterns - Array of route patterns to match against
 */
function matchesRoutePattern(
  currentRoute: string,
  patterns: string[]
): boolean {
  // First try exact match (works for Next.js where pathname is the pattern)
  if (patterns.includes(currentRoute)) {
    return true;
  }

  // Convert patterns to regexes and try matching (works for SPA where pathname is actual path)
  return patterns.some((pattern) => {
    // Escape special regex chars except [ and ]
    const escaped = pattern.replace(/[.*+?^${}()|\\]/g, "\\$&");
    // Convert [paramName] to [^/]+ to match any segment
    const regexStr = "^" + escaped.replace(/\[[^\]]+\]/g, "[^/]+") + "$";
    return new RegExp(regexStr).test(currentRoute);
  });
}

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
  | "credits_usage";

export const ADMIN_ROUTE_PATTERNS: Record<SubNavigationAdminId, string[]> = {
  members: ["/w/[wId]/members"],
  workspace: ["/w/[wId]/workspace"],
  analytics: ["/w/[wId]/analytics"],
  subscription: ["/w/[wId]/subscription"],
  api_keys: ["/w/[wId]/developers/api-keys"],
  credits_usage: ["/w/[wId]/developers/credits-usage"],
  providers: ["/w/[wId]/developers/providers"],
  dev_secrets: ["/w/[wId]/developers/dev-secrets"],
};

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
  ref?: React.RefObject<HTMLDivElement>;
};

export type SidebarNavigation = {
  id:
    | "assistants"
    | "data_sources"
    | "workspace"
    | "developers"
    | "help"
    | "api";
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
    href: getConversationRoute(owner.sId),
    icon: ChatBubbleLeftRightIcon,
    sizing: "hug",
    isCurrent: (currentRoute) =>
      matchesRoutePattern(currentRoute, [
        "/w/[wId]/conversation/new",
        "/w/[wId]/conversation/[cId]",
        "/w/[wId]/conversation/space/[spaceId]",
      ]),
  });

  nav.push({
    id: "data_sources",
    label: "Spaces",
    icon: PlanetIcon,
    href: `/w/${owner.sId}/spaces`,
    isCurrent: (currentRoute: string) =>
      currentRoute.startsWith("/w/[wId]/spaces/") ||
      /^\/w\/[^/]+\/spaces\//.test(currentRoute),
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
        matchesRoutePattern(currentRoute, [
          "/w/[wId]/members",
          "/w/[wId]/workspace",
          "/w/[wId]/subscription",
          "/w/[wId]/analytics",
          "/w/[wId]/actions",
          "/w/[wId]/developers/credits-usage",
          "/w/[wId]/developers/providers",
          "/w/[wId]/developers/api-keys",
          "/w/[wId]/developers/dev-secrets",
        ]),
      sizing: "hug",
    });
  }

  return nav;
};

export const subNavigationAdmin = ({
  owner,
  currentRoute,
  featureFlags: _featureFlags,
}: {
  owner: WorkspaceType;
  currentRoute: string;
  featureFlags: WhitelistableFeature[];
}): SidebarNavigation[] => {
  const nav: SidebarNavigation[] = [];

  if (!isBuilder(owner)) {
    return nav;
  }

  const isCurrent = (id: SubNavigationAdminId): boolean =>
    matchesRoutePattern(currentRoute, ADMIN_ROUTE_PATTERNS[id]);

  if (isAdmin(owner)) {
    nav.push({
      id: "workspace",
      label: "Workspace",
      variant: "primary",
      menus: [
        {
          id: "members",
          label: "People & Security",
          icon: UserIcon,
          href: `/w/${owner.sId}/members`,
          current: isCurrent("members"),
        },
        {
          id: "workspace",
          label: "Workspace Settings",
          icon: GlobeAltIcon,
          href: `/w/${owner.sId}/workspace`,
          current: isCurrent("workspace"),
        },
        {
          id: "analytics",
          label: "Analytics",
          icon: BarChartIcon,
          href: `/w/${owner.sId}/analytics`,
          current: isCurrent("analytics"),
        },
        {
          id: "subscription",
          label: "Subscription",
          icon: ShapesIcon,
          href: `/w/${owner.sId}/subscription`,
          current: isCurrent("subscription"),
        },
      ],
    });

    nav.push({
      id: "api",
      label: "API & Programmatic",
      variant: "primary",
      menus: [
        {
          id: "api_keys",
          label: "API Keys",
          icon: LockIcon,
          href: `/w/${owner.sId}/developers/api-keys`,
          current: isCurrent("api_keys"),
        },
        {
          id: "credits_usage",
          label: "Programmatic usage",
          icon: CardIcon,
          href: `/w/${owner.sId}/developers/credits-usage`,
          current: isCurrent("credits_usage"),
        },
      ],
    });

    nav.push({
      id: "developers",
      label: "Builder Tools",
      variant: "primary",
      menus: [
        {
          id: "providers",
          label: "Providers",
          icon: ShapesIcon,
          href: `/w/${owner.sId}/developers/providers`,
          current: isCurrent("providers"),
        },
        {
          id: "dev_secrets",
          label: "Secrets",
          icon: BracesIcon,
          href: `/w/${owner.sId}/developers/dev-secrets`,
          current: isCurrent("dev_secrets"),
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
