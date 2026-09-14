import { RequirePermissionLayout } from "@spa/app/layouts/RequirePermissionLayout";
import { RequireRoleLayout } from "@spa/app/layouts/RequireRoleLayout";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

const AnalyticsConsumptionPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/AnalyticsConsumptionPage"
    ),
  "AnalyticsConsumptionPage"
);
const AnalyticsAutomationsPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/AnalyticsAutomationsPage"
    ),
  "AnalyticsAutomationsPage"
);
const APIKeysPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/developers/APIKeysPage"),
  "APIKeysPage"
);
const CreditsUsagePage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/developers/CreditsUsagePage"
    ),
  "CreditsUsagePage"
);
const ProvidersPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/developers/ProvidersPage"
    ),
  "ProvidersPage"
);
const SecretsPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/developers/SecretsPage"),
  "SecretsPage"
);
const SandboxPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/developers/SandboxPage"),
  "SandboxPage"
);
const SelfImprovingSkillsPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/developers/SelfImprovingSkillsPage"
    ),
  "SelfImprovingSkillsPage"
);
const MembersPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/MembersPage"),
  "MembersPage"
);
const WorkspaceIdentityProvisioningPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/WorkspaceIdentityProvisioningPage.js"
    ),
  "WorkspaceIdentityProvisioningPage"
);
const ManageSubscriptionPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/subscription/ManageSubscriptionPage"
    ),
  "ManageSubscriptionPage"
);
const SubscriptionPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/subscription/SubscriptionPage"
    ),
  "SubscriptionPage"
);
const WorkspaceBrandingPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/WorkspaceBrandingPage"),
  "WorkspaceBrandingPage"
);
const ModelProvidersPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/model_providers/ModelProvidersPage"
    ),
  "ModelProvidersPage"
);
const UsagePage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/UsagePage"),
  "UsagePage"
);
const BillingPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/billing/BillingPage"),
  "BillingPage"
);
const GovernancePage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/governance/GovernancePage"
    ),
  "GovernancePage"
);

export const adminRoutes: RouteObject[] = [
  {
    // Accessible to admins and managers.
    element: <RequireRoleLayout requiredRole="manager" />,
    children: [
      { path: "members", element: <MembersPage /> },
      // Legacy analytics page, now superseded by consumption analytics.
      {
        path: "analytics",
        element: <Navigate to="../analytics/consumption" replace />,
      },
      {
        path: "analytics/consumption",
        element: <AnalyticsConsumptionPage />,
      },
      {
        path: "automations",
        element: <AnalyticsAutomationsPage />,
      },
      { path: "usage", element: <UsagePage /> },
      { path: "governance", element: <GovernancePage /> },
      // Legacy Workspace Settings page, merged into Settings & Governance.
      { path: "workspace", element: <Navigate to="../governance" replace /> },
    ],
  },
  {
    // Admin-only areas.
    element: <RequireRoleLayout requiredRole="admin" />,
    children: [
      { path: "model-providers", element: <ModelProvidersPage /> },
      { path: "branding", element: <WorkspaceBrandingPage /> },
      { path: "developers/api-keys", element: <APIKeysPage /> },
      {
        path: "developers/credits-usage",
        element: <CreditsUsagePage />,
      },
      {
        path: "developers/providers",
        element: <ProvidersPage />,
      },
      {
        path: "developers/dev-secrets",
        element: <SecretsPage />,
      },
      {
        path: "developers/sandbox",
        element: <SandboxPage />,
      },
      {
        path: "developers/self-improving-skills",
        element: <SelfImprovingSkillsPage />,
      },
    ],
  },
  {
    // Billing areas: accessible to admins and to members holding the billing admin permission.
    element: <RequirePermissionLayout verb="admin" resourceType="billing" />,
    children: [
      { path: "subscription", element: <SubscriptionPage /> },
      { path: "billing", element: <BillingPage /> },
    ],
  },
  {
    element: <RequirePermissionLayout verb="admin" resourceType="security" />,
    children: [
      {
        path: "identity-and-provisioning",
        element: <WorkspaceIdentityProvisioningPage />,
      },
    ],
  },
];

export const adminFullPageRoutes: RouteObject[] = [
  {
    path: "subscription/manage",
    element: <ManageSubscriptionPage />,
  },
];
