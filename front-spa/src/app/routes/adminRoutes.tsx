import { RequirePermissionLayout } from "@spa/app/layouts/RequirePermissionLayout";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";

const AnalyticsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/AnalyticsPage"),
  "AnalyticsPage"
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
const WorkspaceSettingsPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/WorkspaceSettingsPage"),
  "WorkspaceSettingsPage"
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

export const adminRoutes: RouteObject[] = [
  {
    // People page: accessible to admins and business admins.
    element: <RequirePermissionLayout permission="workspace:manage_members" />,
    children: [{ path: "members", element: <MembersPage /> }],
  },
  {
    element: <RequirePermissionLayout permission="workspace:view_analytics" />,
    children: [{ path: "analytics", element: <AnalyticsPage /> }],
  },
  {
    // Admin-only areas.
    element: <RequirePermissionLayout permission="workspace:admin" />,
    children: [
      {
        path: "identity-and-provisioning",
        element: <WorkspaceIdentityProvisioningPage />,
      },
      { path: "model-providers", element: <ModelProvidersPage /> },
      { path: "workspace", element: <WorkspaceSettingsPage /> },
      { path: "branding", element: <WorkspaceBrandingPage /> },
      { path: "usage", element: <UsagePage /> },
      { path: "subscription", element: <SubscriptionPage /> },
      { path: "billing", element: <BillingPage /> },
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
];

export const adminFullPageRoutes: RouteObject[] = [
  {
    path: "subscription/manage",
    element: <ManageSubscriptionPage />,
  },
];
