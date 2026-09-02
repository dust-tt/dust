import { computeIsSelfImprovementAvailable } from "@app/lib/client/self_improvement";
import { getConversationRoute } from "@app/lib/utils/router";
import type { AppType } from "@app/types/app";
import type {
  ConcreteResourceType,
  GrantVerb,
} from "@app/types/group_permissions";
import type { SubscriptionType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin, isManager } from "@app/types/user";
import {
  BarChart01,
  Brackets,
  Brain,
  Clock,
  CreditCard01,
  File04,
  Fingerprint04,
  FolderOpen,
  Globe01,
  IntersectDust,
  Lock01,
  Palette,
  PieChart01,
  Planet,
  Settings01,
  Shapes,
  Stars02,
  Terminal,
  Toggle01Left,
  Users01,
  Zap,
} from "@dust-tt/sparkle";

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

type SubNavigationAdminId =
  | "subscription"
  | "billing"
  | "governance"
  | "workspace_branding"
  | "model_providers"
  | "members"
  | "identity_and_provisioning"
  | "providers"
  | "api_keys"
  | "dev_secrets"
  | "sandbox"
  | "analytics"
  | "automations"
  | "credits_usage"
  | "usage"
  | "self_improving_skills";

const ADMIN_ROUTE_PATTERNS: Record<SubNavigationAdminId, string[]> = {
  members: ["/w/[wId]/members"],
  identity_and_provisioning: ["/w/[wId]/identity-and-provisioning"],
  governance: ["/w/[wId]/governance"],
  workspace_branding: ["/w/[wId]/brand"],
  model_providers: ["/w/[wId]/model-providers"],
  analytics: ["/w/[wId]/analytics/consumption"],
  automations: ["/w/[wId]/automations"],
  subscription: ["/w/[wId]/subscription"],
  billing: ["/w/[wId]/billing"],
  api_keys: ["/w/[wId]/developers/api-keys"],
  credits_usage: ["/w/[wId]/developers/credits-usage"],
  providers: ["/w/[wId]/developers/providers"],
  dev_secrets: ["/w/[wId]/developers/dev-secrets"],
  sandbox: ["/w/[wId]/developers/sandbox"],
  usage: ["/w/[wId]/usage"],
  self_improving_skills: ["/w/[wId]/developers/self-improving-skills"],
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
    | "workspace"
    | "developers"
    | "help"
    | "api";
  label: string | null;
  menus: AppLayoutNavigation[];
};

export const getTopNavigationTabs = (
  owner: WorkspaceType,
  spaceMenuButtonRef: React.RefObject<HTMLDivElement>,
  showAdminSection: boolean,
  adminSectionHref: string | null
) => {
  const nav: TabAppLayoutNavigation[] = [];

  nav.push({
    id: "conversations",
    label: "Work",
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
    label: "Spaces",
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
      label: "Admin",
      icon: Settings01,
      href: adminSectionHref ?? `/w/${owner.sId}/members`,
      isCurrent: (currentRoute) =>
        matchesRoutePattern(currentRoute, [
          "/w/[wId]/members",
          "/w/[wId]/identity-and-provisioning",
          "/w/[wId]/governance",
          "/w/[wId]/branding",
          "/w/[wId]/model-providers",
          "/w/[wId]/subscription",
          "/w/[wId]/billing",
          "/w/[wId]/analytics",
          "/w/[wId]/analytics/consumption",
          "/w/[wId]/automations",
          "/w/[wId]/actions",
          "/w/[wId]/developers/credits-usage",
          "/w/[wId]/developers/providers",
          "/w/[wId]/developers/api-keys",
          "/w/[wId]/developers/dev-secrets",
          "/w/[wId]/developers/sandbox",
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
}: {
  owner: WorkspaceType;
  currentRoute: string;
  featureFlags: WhitelistableFeature[];
  subscription: SubscriptionType;
  hasPermission: (
    verb: GrantVerb,
    resourceType: ConcreteResourceType
  ) => boolean;
}): SidebarNavigation[] => {
  const nav: SidebarNavigation[] = [];

  const canAdminBilling = hasPermission("admin", "billing");
  const canAdminSecurity = hasPermission("admin", "security");

  // Admins and managers see the admin sidebar; builders and members do
  // not. Each item is then individually enabled/disabled based on permission.
  if (!isManager(owner) && !canAdminBilling && !canAdminSecurity) {
    return nav;
  }

  const isCurrent = (id: SubNavigationAdminId): boolean =>
    matchesRoutePattern(currentRoute, ADMIN_ROUTE_PATTERNS[id]);

  const hasAdminRole = isAdmin(owner);
  const hasManagerRole = isManager(owner);

  nav.push({
    id: "workspace",
    label: "Workspace",
    menus: [
      {
        id: "members",
        label: "People",
        icon: Users01,
        href: `/w/${owner.sId}/members`,
        current: isCurrent("members"),
        disabled: !hasManagerRole,
      },
      {
        id: "identity_and_provisioning",
        label: "IT & Security",
        icon: Fingerprint04,
        href: `/w/${owner.sId}/identity-and-provisioning`,
        current: isCurrent("identity_and_provisioning"),
        disabled: !canAdminSecurity,
      },
      {
        id: "governance",
        label: "Settings & Governance",
        icon: Toggle01Left,
        href: `/w/${owner.sId}/governance`,
        current: isCurrent("governance"),
        disabled: !hasManagerRole,
      },
      ...(featureFlags.includes("whitelabel_frames")
        ? [
            {
              id: "workspace_branding" as const,
              label: "Branding",
              icon: Palette,
              href: `/w/${owner.sId}/branding`,
              current: isCurrent("workspace_branding"),
              disabled: !hasAdminRole,
            },
          ]
        : []),
      {
        id: "usage" as const,
        label: "Usage",
        icon: PieChart01,
        href: `/w/${owner.sId}/usage`,
        current: isCurrent("usage"),
        disabled: !hasManagerRole,
      },
      {
        id: "model_providers",
        label: "Model Providers",
        icon: Brain,
        href: `/w/${owner.sId}/model-providers`,
        current: isCurrent("model_providers"),
        disabled: !hasAdminRole,
      },
      {
        id: "analytics",
        label: "Analytics",
        icon: BarChart01,
        href: `/w/${owner.sId}/analytics/consumption`,
        current: isCurrent("analytics"),
        disabled: !hasManagerRole,
      },
      isCreditPricedPlan(subscription.plan)
        ? {
            id: "billing",
            label: "Billing",
            icon: CreditCard01,
            href: `/w/${owner.sId}/billing`,
            current: isCurrent("billing"),
            disabled: !canAdminBilling,
          }
        : {
            id: "subscription",
            label: "Subscription",
            icon: CreditCard01,
            href: `/w/${owner.sId}/subscription`,
            current: isCurrent("subscription"),
            disabled: !canAdminBilling,
          },
    ],
  });

  nav.push({
    id: "api",
    label: "Programmatic Usage",
    menus: [
      {
        id: "api_keys",
        label: "API Keys",
        icon: Lock01,
        href: `/w/${owner.sId}/developers/api-keys`,
        current: isCurrent("api_keys"),
        disabled: !hasAdminRole,
      },
      ...(isCreditPricedPlan(subscription.plan)
        ? []
        : [
            {
              id: "credits_usage" as const,
              label: "Credits Usage",
              icon: Zap,
              href: `/w/${owner.sId}/developers/credits-usage`,
              current: isCurrent("credits_usage"),
              disabled: !hasAdminRole,
            },
          ]),
      {
        id: "automations" as const,
        label: "Automations",
        icon: Clock,
        href: `/w/${owner.sId}/automations`,
        current: isCurrent("automations"),
        disabled: !hasManagerRole,
      },
    ],
  });

  nav.push({
    id: "developers",
    label: "Builder Tools",
    menus: [
      {
        id: "providers",
        label: "App Credentials",
        icon: Shapes,
        href: `/w/${owner.sId}/developers/providers`,
        current: isCurrent("providers"),
        featureFlag: "legacy_dust_apps",
        disabled: !hasAdminRole,
      },
      {
        id: "dev_secrets",
        label: "Secrets",
        icon: Brackets,
        href: `/w/${owner.sId}/developers/dev-secrets`,
        current: isCurrent("dev_secrets"),
        disabled: !hasAdminRole,
      },
      {
        id: "sandbox",
        label: "Computer",
        icon: Globe01,
        href: `/w/${owner.sId}/developers/sandbox`,
        current: isCurrent("sandbox"),
        disabled: !hasAdminRole || !isComputerFeatureEnabled(featureFlags),
      },
      ...(computeIsSelfImprovementAvailable({
        owner,
        plan: subscription.plan,
        featureFlags,
      })
        ? [
            {
              id: "self_improving_skills" as const,
              label: "Self-Improving Skills",
              icon: Stars02,
              href: `/w/${owner.sId}/developers/self-improving-skills`,
              current: isCurrent("self_improving_skills"),
              disabled: !hasAdminRole,
            },
          ]
        : []),
    ],
  });

  return nav;
};

export const subNavigationApp = ({
  owner,
  app,
  current,
  canAdministrateApps,
}: {
  owner: WorkspaceType;
  app: AppType;
  current: SubNavigationAppId;
  canAdministrateApps: boolean;
}) => {
  let nav = [
    {
      value: "specification",
      label: "Specification",
      icon: Terminal,
      href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}`,
      current: current === "specification",
    },
    {
      value: "datasets",
      label: "Datasets",
      icon: File04,
      href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets`,
      current: current === "datasets",
    },
  ];

  if (canAdministrateApps) {
    nav = nav.concat([
      {
        value: "runs",
        label: "Logs",
        icon: FolderOpen,
        href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs`,
        current: current === "runs",
      },
      {
        value: "settings",
        label: "Settings",
        icon: Settings01,
        href: `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/settings`,
        current: current === "settings",
      },
    ]);
  }

  return nav;
};
