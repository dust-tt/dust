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
const PaymentProcessingPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/subscription/PaymentProcessingPage"
    ),
  "PaymentProcessingPage"
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

export const adminRoutes: RouteObject[] = [
  { path: "me", element: <ProfilePage /> },
  {
    element: <AdminRouterLayout />,
    children: [
      { path: "members", element: <MembersPage /> },
      { path: "workspace", element: <WorkspaceSettingsPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
      { path: "subscription", element: <SubscriptionPage /> },
      {
        path: "subscription/manage",
        element: <ManageSubscriptionPage />,
      },
      {
        path: "subscription/payment_processing",
        element: <PaymentProcessingPage />,
      },
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
    ],
  },
];
