import { AdminRouterLayout } from "@spa/app/layouts/AdminRouterLayout";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";

const ProfilePage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/ProfilePage"),
  "ProfilePage"
);
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
  { path: "me", element: <ProfilePage /> },
  {
    element: <AdminRouterLayout />,
    children: [
      { path: "members", element: <MembersPage /> },
      { path: "model-providers", element: <ModelProvidersPage /> },
      { path: "workspace", element: <WorkspaceSettingsPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
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
