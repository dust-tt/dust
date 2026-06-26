import { computeIsSelfImprovementAvailable } from "@app/lib/client/self_improvement";
import { getConversationRoute } from "@app/lib/utils/router";
import type { AppType } from "@app/types/app";
import { hasPermission } from "@app/types/permissions";
import { isCreditPricedPlan, type SubscriptionType } from "@app/types/plan";
import {
  isComputerFeatureEnabled,
  type WhitelistableFeature,
} from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin, isBuilder, isOnlyBusinessAdmin } from "@app/types/user";
import {
  BarChart01,
  Brackets,
  Brain,
  Building04,
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
  | "billing"
  | "workspace"
  | "workspace_branding"
  | "model_providers"
  | "members"
  | "identity_and_provisioning"
  | "providers"
  | "api_keys"
  | "dev_secrets"
  | "sandbox"
  | "analytics"
  | "credits_usage"
  | "usage"
  | "self_improving_skills";

export const ADMIN_ROUTE_PATTERNS: Record<SubNavigationAdminId, string[]> = {
  members: ["/w/[wId]/members"],
  identity_and_provisioning: ["/w/[wId]/identity-and-provisioning"],
  workspace: ["/w/[wId]/workspace"],
  workspace_branding: ["/w/[wId]/brand"],
  model_providers: ["/w/[wId]/model-providers"],
  analytics: ["/w/[wId]/analytics"],
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
  spaceMenuButtonRef: React.RefObject<HTMLDivElement>
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

  if (isAdmin(owner) || isOnlyBusinessAdmin(owner)) {
    nav.push({
      id: "settings",
      label: "Admin",
      icon: Settings01,
      href: `/w/${owner.sId}/members`,
      isCurrent: (currentRoute) =>
        matchesRoutePattern(currentRoute, [
          "/w/[wId]/members",
          "/w/[wId]/identity-and-provisioning",
          "/w/[wId]/workspace",
          "/w/[wId]/branding",
          "/w/[wId]/model-providers",
          "/w/[wId]/subscription",
          "/w/[wId]/billing",
          "/w/[wId]/analytics",
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
}: {
  owner: WorkspaceType;
  currentRoute: string;
  featureFlags: WhitelistableFeature[];
  subscription: SubscriptionType;
}): SidebarNavigation[] => {
  const nav: SidebarNavigation[] = [];

  // Admins and business admins see the admin sidebar; builders and members do
  // not. Each item is then individually enabled/disabled based on permission.
  if (!isAdmin(owner) && !isOnlyBusinessAdmin(owner)) {
    return nav;
  }

  const isCurrent = (id: SubNavigationAdminId): boolean =>
    matchesRoutePattern(currentRoute, ADMIN_ROUTE_PATTERNS[id]);

  const hasWorkspaceAdminPermission = hasPermission(
    owner.role,
    "workspace:admin"
  );

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
        disabled: !hasPermission(owner.role, "workspace:manage_members"),
      },
      {
        id: "identity_and_provisioning",
        label: "Identity & Provisioning",
        icon: Fingerprint04,
        href: `/w/${owner.sId}/identity-and-provisioning`,
        current: isCurrent("identity_and_provisioning"),
        disabled: !hasWorkspaceAdminPermission,
      },
      {
        id: "workspace",
        label: "Workspace Settings",
        icon: Building04,
        href: `/w/${owner.sId}/workspace`,
        current: isCurrent("workspace"),
        disabled: !hasWorkspaceAdminPermission,
      },
      ...(featureFlags.includes("whitelabel_frames")
        ? [
            {
              id: "workspace_branding" as const,
              label: "Branding",
              icon: Palette,
              href: `/w/${owner.sId}/branding`,
              current: isCurrent("workspace_branding"),
              disabled: !hasWorkspaceAdminPermission,
            },
          ]
        : []),
      ...(isCreditPricedPlan(subscription.plan) ||
      featureFlags.includes("usage_page_read_only")
        ? [
            {
              id: "usage" as const,
              label: "Usage",
              icon: PieChart01,
              href: `/w/${owner.sId}/usage`,
              current: isCurrent("usage"),
              disabled: !hasWorkspaceAdminPermission,
            },
          ]
        : []),
      {
        id: "model_providers",
        label: "Model Providers",
        icon: Brain,
        href: `/w/${owner.sId}/model-providers`,
        current: isCurrent("model_providers"),
        disabled: !hasWorkspaceAdminPermission,
      },
      {
        id: "analytics",
        label: "Analytics",
        icon: BarChart01,
        href: `/w/${owner.sId}/analytics`,
        current: isCurrent("analytics"),
        disabled: !hasPermission(owner.role, "workspace:view_analytics"),
      },
      isCreditPricedPlan(subscription.plan)
        ? {
            id: "billing",
            label: "Billing",
            icon: CreditCard01,
            href: `/w/${owner.sId}/billing`,
            current: isCurrent("billing"),
            disabled: !hasWorkspaceAdminPermission,
          }
        : {
            id: "subscription",
            label: "Subscription",
            icon: CreditCard01,
            href: `/w/${owner.sId}/subscription`,
            current: isCurrent("subscription"),
            disabled: !hasWorkspaceAdminPermission,
          },
    ],
  });

  nav.push({
    id: "api",
    label: "API & Programmatic",
    menus: [
      {
        id: "api_keys",
        label: "API Keys",
        icon: Lock01,
        href: `/w/${owner.sId}/developers/api-keys`,
        current: isCurrent("api_keys"),
        disabled: !hasWorkspaceAdminPermission,
      },
      ...(isCreditPricedPlan(subscription.plan)
        ? []
        : [
            {
              id: "credits_usage" as const,
              label: "Programmatic Usage",
              icon: Zap,
              href: `/w/${owner.sId}/developers/credits-usage`,
              current: isCurrent("credits_usage"),
              disabled: !hasWorkspaceAdminPermission,
            },
          ]),
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
        disabled: !hasWorkspaceAdminPermission,
      },
      {
        id: "dev_secrets",
        label: "Secrets",
        icon: Brackets,
        href: `/w/${owner.sId}/developers/dev-secrets`,
        current: isCurrent("dev_secrets"),
        disabled: !hasWorkspaceAdminPermission,
      },
      {
        id: "sandbox",
        label: "Computer",
        icon: Globe01,
        href: `/w/${owner.sId}/developers/sandbox`,
        current: isCurrent("sandbox"),
        disabled:
          !hasWorkspaceAdminPermission ||
          !isComputerFeatureEnabled(featureFlags),
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
              disabled: !hasWorkspaceAdminPermission,
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
}: {
  owner: WorkspaceType;
  app: AppType;
  current: SubNavigationAppId;
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

  if (isAdmin(owner) || isBuilder(owner)) {
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
