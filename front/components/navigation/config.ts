import { getConversationRoute } from "@app/lib/utils/router";
import type { AppType } from "@app/types/app";
import type {
  ConcreteResourceType,
  GrantVerb,
} from "@app/types/group_permissions";
import type { SubscriptionType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin, isManager } from "@app/types/user";
import {
  BarChart01,
  Brain,
  Clock,
  CoinsStacked01,
  CreditCard01,
  File04,
  FolderOpen,
  IntersectDust,
  Palette,
  Planet,
  PuzzlePiece01,
  Settings01,
  ShieldTick,
  Terminal,
  Toggle01Left,
  Users01,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

type Translate = (descriptor: MessageDescriptor) => string;

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
type TopNavigationId =
  | "conversations"
  | "assistants"
  | "admin"
  | "data_sources";

type SubNavigationConversationsId = "conversation" | "personal_assistants";

type SubNavigationAssistantsId =
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
  | "members"
  | "security"
  | "governance"
  | "workspace_branding"
  | "credits"
  | "billing"
  | "subscription"
  | "analytics"
  | "models"
  | "integrations"
  | "automations"
  | "developers";

export const ADMIN_ROUTE_PATTERNS: Record<SubNavigationAdminId, string[]> = {
  members: ["/w/[wId]/members"],
  security: ["/w/[wId]/security", "/w/[wId]/identity-and-provisioning"],
  governance: ["/w/[wId]/governance"],
  workspace_branding: ["/w/[wId]/branding", "/w/[wId]/brand"],
  credits: ["/w/[wId]/credits", "/w/[wId]/usage"],
  billing: ["/w/[wId]/billing"],
  subscription: ["/w/[wId]/subscription"],
  analytics: ["/w/[wId]/analytics/consumption"],
  models: ["/w/[wId]/models", "/w/[wId]/model-providers"],
  integrations: ["/w/[wId]/integrations"],
  automations: ["/w/[wId]/automations"],
  developers: ["/w/[wId]/developers", "/w/[wId]/developers/api-keys"],
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
  sizing?: "hug" | "expand";
  hasSeparator?: boolean;
  current: boolean;
  featureFlag?: WhitelistableFeature;
  // When true, the item is shown but greyed out and not navigable (the current
  // role lacks the permission to access it).
  disabled?: boolean;
};

type TabAppLayoutNavigation = {
  id:
    | TopNavigationId
    | SubNavigationConversationsId
    | SubNavigationAssistantsId
    | SubNavigationAdminId
    | SubNavigationAppId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
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
    | "organization"
    | "spend"
    | "platform"
    // Legacy group ids kept for non-admin sidebars that still reference them.
    | "workspace"
    | "developers"
    | "help"
    | "api";
  label: string | null;
  menus: AppLayoutNavigation[];
};

export function getAdminSectionHref(
  owner: WorkspaceType,
  hasPermission: (
    verb: GrantVerb,
    resourceType: ConcreteResourceType
  ) => boolean,
  hasManagedGroups: boolean
): string | null {
  if (isManager(owner)) {
    return `/w/${owner.sId}/members`;
  }
  if (hasPermission("admin", "billing")) {
    return `/w/${owner.sId}/billing`;
  }
  if (hasPermission("admin", "security")) {
    return `/w/${owner.sId}/security`;
  }
  return hasManagedGroups ? `/w/${owner.sId}/credits` : null;
}

export const getTopNavigationTabs = (
  owner: WorkspaceType,
  spaceMenuButtonRef: React.RefObject<HTMLDivElement>,
  showAdminSection: boolean,
  adminSectionHref: string | null,
  t: Translate
) => {
  const nav: TabAppLayoutNavigation[] = [];

  nav.push({
    id: "conversations",
    label: t(msg`Work`),
    href: getConversationRoute(owner.sId),
    icon: IntersectDust,
    sizing: "hug",
    isCurrent: (currentRoute) =>
      matchesRoutePattern(currentRoute, [
        "/w/[wId]/conversation/new",
        "/w/[wId]/conversation/[cId]",
        "/w/[wId]/conversation/space/[spaceId]",
        "/w/[wId]/get-started",
      ]),
  });

  nav.push({
    id: "data_sources",
    label: t(msg`Spaces`),
    icon: Planet,
    href: `/w/${owner.sId}/spaces`,
    isCurrent: (currentRoute: string) =>
      currentRoute.startsWith("/w/[wId]/spaces") ||
      /^\/w\/[^/]+\/spaces/.test(currentRoute),
    sizing: "hug",
    ref: spaceMenuButtonRef,
  });

  if (showAdminSection) {
    nav.push({
      id: "settings",
      label: t(msg`Admin`),
      icon: Settings01,
      href: adminSectionHref ?? `/w/${owner.sId}/members`,
      isCurrent: (currentRoute) =>
        matchesRoutePattern(currentRoute, [
          "/w/[wId]/members",
          "/w/[wId]/security",
          "/w/[wId]/identity-and-provisioning",
          "/w/[wId]/governance",
          "/w/[wId]/branding",
          "/w/[wId]/models",
          "/w/[wId]/model-providers",
          "/w/[wId]/subscription",
          "/w/[wId]/billing",
          "/w/[wId]/analytics",
          "/w/[wId]/analytics/consumption",
          "/w/[wId]/automations",
          "/w/[wId]/actions",
          "/w/[wId]/integrations",
          "/w/[wId]/developers",
          "/w/[wId]/developers/credits-usage",
          "/w/[wId]/developers/providers",
          "/w/[wId]/developers/api-keys",
          "/w/[wId]/developers/dev-secrets",
          "/w/[wId]/developers/sandbox",
          "/w/[wId]/credits",
          "/w/[wId]/usage",
          "/w/[wId]/developers/self-improving-skills",
        ]),
      sizing: "hug",
    });
  }

  return nav;
};

export const subNavigationAdmin = ({
  owner,
  currentRoute,
  featureFlags,
  subscription,
  hasPermission,
  hasManagedGroups = false,
  t,
}: {
  owner: WorkspaceType;
  currentRoute: string;
  featureFlags: WhitelistableFeature[];
  subscription: SubscriptionType;
  hasManagedGroups?: boolean;
  hasPermission: (
    verb: GrantVerb,
    resourceType: ConcreteResourceType
  ) => boolean;
  t: Translate;
}): SidebarNavigation[] => {
  const nav: SidebarNavigation[] = [];

  const canAdminBilling = hasPermission("admin", "billing");
  const canAdminSecurity = hasPermission("admin", "security");

  // Admins and managers see the admin sidebar. Each item is then individually enabled/disabled
  // based on permission.
  if (
    !isManager(owner) &&
    !canAdminBilling &&
    !canAdminSecurity &&
    !hasManagedGroups
  ) {
    return nav;
  }

  const isCurrent = (id: SubNavigationAdminId): boolean =>
    matchesRoutePattern(currentRoute, ADMIN_ROUTE_PATTERNS[id]);

  const hasAdminRole = isAdmin(owner);
  const hasManagerRole = isManager(owner);

  nav.push({
    id: "organization",
    label: t(msg`Organization`),
    menus: [
      {
        id: "members",
        label: t(msg`Members`),
        icon: Users01,
        href: `/w/${owner.sId}/members`,
        current: isCurrent("members"),
        disabled: !hasManagerRole && !hasManagedGroups,
      },
      {
        id: "security",
        label: t(msg`Security`),
        icon: ShieldTick,
        href: `/w/${owner.sId}/security`,
        current: isCurrent("security"),
        disabled: !canAdminSecurity,
      },
      {
        id: "governance",
        label: t(msg`Governance`),
        icon: Toggle01Left,
        href: `/w/${owner.sId}/governance`,
        current: isCurrent("governance"),
        disabled: !hasManagerRole,
      },
      ...(featureFlags.includes("whitelabel_frames")
        ? [
            {
              id: "workspace_branding" as const,
              label: t(msg`Branding`),
              icon: Palette,
              href: `/w/${owner.sId}/branding`,
              current: isCurrent("workspace_branding"),
              disabled: !hasAdminRole,
            },
          ]
        : []),
    ],
  });

  nav.push({
    id: "spend",
    label: t(msg`Spend`),
    menus: [
      {
        id: "credits" as const,
        label: t(msg`Credits`),
        icon: CoinsStacked01,
        href: `/w/${owner.sId}/credits`,
        current: isCurrent("credits"),
        disabled: !hasManagerRole && !hasManagedGroups,
      },
      isCreditPricedPlan(subscription.plan)
        ? {
            id: "billing" as const,
            label: t(msg`Billing`),
            icon: CreditCard01,
            href: `/w/${owner.sId}/billing`,
            current: isCurrent("billing"),
            disabled: !canAdminBilling,
          }
        : {
            id: "subscription" as const,
            label: t(msg`Subscription`),
            icon: CreditCard01,
            href: `/w/${owner.sId}/subscription`,
            current: isCurrent("subscription"),
            disabled: !canAdminBilling,
          },
      {
        id: "analytics",
        label: t(msg`Analytics`),
        icon: BarChart01,
        href: `/w/${owner.sId}/analytics/consumption`,
        current: isCurrent("analytics"),
        disabled: !hasManagerRole,
      },
    ],
  });

  nav.push({
    id: "platform",
    label: t(msg`Platform`),
    menus: [
      {
        id: "models",
        label: t(msg`Models`),
        icon: Brain,
        href: `/w/${owner.sId}/models`,
        current: isCurrent("models"),
        disabled: !hasAdminRole,
      },
      {
        id: "integrations",
        label: t(msg`Integrations`),
        icon: PuzzlePiece01,
        href: `/w/${owner.sId}/integrations`,
        current: isCurrent("integrations"),
        disabled: !hasAdminRole,
      },
      {
        id: "automations" as const,
        label: t(msg`Automations`),
        icon: Clock,
        href: `/w/${owner.sId}/automations`,
        current: isCurrent("automations"),
        disabled: !hasManagerRole,
      },
      {
        id: "developers",
        label: t(msg`Developers`),
        icon: Terminal,
        href: `/w/${owner.sId}/developers`,
        current: isCurrent("developers"),
        disabled: !hasAdminRole,
      },
    ],
  });

  return nav;
};

export const subNavigationApp = ({
  owner,
  app,
  current,
  canAdministrateApps,
  t,
}: {
  owner: WorkspaceType;
  app: AppType;
  current: SubNavigationAppId;
  canAdministrateApps: boolean;
  t: Translate;
}) => {
  let nav = [
    {
      value: "specification",
      label: t(msg`Specification`),
      icon: Terminal,
      href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}`,
      current: current === "specification",
    },
    {
      value: "datasets",
      label: t(msg`Datasets`),
      icon: File04,
      href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets`,
      current: current === "datasets",
    },
  ];

  if (canAdministrateApps) {
    nav = nav.concat([
      {
        value: "runs",
        label: t(msg`Logs`),
        icon: FolderOpen,
        href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs`,
        current: current === "runs",
      },
      {
        value: "settings",
        label: t(msg`Settings`),
        icon: Settings01,
        href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/settings`,
        current: current === "settings",
      },
    ]);
  }

  return nav;
};
