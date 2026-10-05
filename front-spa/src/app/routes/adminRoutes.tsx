import { AdminLayout } from "@dust-tt/front/components/layouts/AdminLayout";
import Custom404 from "@dust-tt/front/components/pages/Custom404";
import { useAuth } from "@dust-tt/front/lib/auth/AuthContext";
import { hasGroupManagementScope } from "@dust-tt/front/types/api/auth_context";
import { isCreditPricedPlan } from "@dust-tt/front/types/plan";
import { isManager } from "@dust-tt/front/types/user";
import { RequirePermissionLayout } from "@spa/app/layouts/RequirePermissionLayout";
import { RequireRoleLayout } from "@spa/app/layouts/RequireRoleLayout";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";
import { Navigate, useParams } from "react-router-dom";

const AnalyticsConsumptionPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/AnalyticsConsumptionPage"),
  "AnalyticsConsumptionPage"
);
const AnalyticsAutomationsPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/AnalyticsAutomationsPage"),
  "AnalyticsAutomationsPage"
);
const DevelopersPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/developers/DevelopersPage"),
  "DevelopersPage"
);
const MembersPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/MembersPage"),
  "MembersPage"
);
const SecurityPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/SecurityPage"),
  "SecurityPage"
);
const ManageSubscriptionPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/subscription/ManageSubscriptionPage"),
  "ManageSubscriptionPage"
);
const SubscriptionPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/subscription/SubscriptionPage"),
  "SubscriptionPage"
);
const WorkspaceBrandingPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/WorkspaceBrandingPage"),
  "WorkspaceBrandingPage"
);
const ModelsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/ModelsPage"),
  "ModelsPage"
);
const IntegrationsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/IntegrationsPage"),
  "IntegrationsPage"
);
const UsagePage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/UsagePage"),
  "UsagePage"
);
const NonCreditPricedUsagePage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/NonCreditPricedUsagePage"),
  "NonCreditPricedUsagePage"
);
const GroupManagerUsagePage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/GroupManagerUsagePage"),
  "GroupManagerUsagePage"
);
const BillingPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/billing/BillingPage"),
  "BillingPage"
);
const GovernancePage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/governance/GovernancePage"),
  "GovernancePage"
);

function PeopleRoute() {
  const { isManager, groupManagement } = useAuth();
  if (!isManager && !hasGroupManagementScope(groupManagement?.read_usage)) {
    return <Custom404 />;
  }
  return (
    <AdminLayout>
      <MembersPage />
    </AdminLayout>
  );
}

function CreditsRoute() {
  const { workspace, subscription, groupManagement } = useAuth();
  if (isManager(workspace)) {
    return (
      <AdminLayout>
        {isCreditPricedPlan(subscription.plan) ? (
          <UsagePage />
        ) : (
          <NonCreditPricedUsagePage />
        )}
      </AdminLayout>
    );
  }
  if (!hasGroupManagementScope(groupManagement?.read_usage)) {
    return <Custom404 />;
  }
  return (
    <AdminLayout>
      <GroupManagerUsagePage />
    </AdminLayout>
  );
}

/** Preserve path params when redirecting legacy admin URLs. */
function WorkspaceRedirect({ to, search }: { to: string; search?: string }) {
  const { wId } = useParams();
  const target = `/w/${wId}/${to}${search ?? ""}`;
  return <Navigate to={target} replace />;
}

export const adminRoutes: RouteObject[] = [
  {
    // Accessible to admins and managers.
    element: <RequireRoleLayout requiredRole="manager" />,
    children: [
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
      { path: "governance", element: <GovernancePage /> },
      // Legacy Workspace Settings page, merged into Governance.
      { path: "workspace", element: <Navigate to="../governance" replace /> },
    ],
  },
  { path: "members", element: <PeopleRoute /> },
  { path: "credits", element: <CreditsRoute /> },
  // Legacy Usage URL → Credits.
  { path: "usage", element: <WorkspaceRedirect to="credits" /> },
  {
    element: <RequireRoleLayout requiredRole="admin" />,
    children: [
      { path: "models", element: <ModelsPage /> },
      {
        path: "model-providers",
        element: <WorkspaceRedirect to="models" />,
      },
      { path: "integrations", element: <IntegrationsPage /> },
      { path: "branding", element: <WorkspaceBrandingPage /> },
      // Legacy short URL → Branding.
      { path: "brand", element: <WorkspaceRedirect to="branding" /> },
      { path: "developers", element: <DevelopersPage /> },
      // Legacy developer URLs → new tabbed pages.
      {
        path: "developers/api-keys",
        element: <WorkspaceRedirect to="developers" />,
      },
      {
        path: "developers/dev-secrets",
        element: <WorkspaceRedirect to="developers" search="?tab=secrets" />,
      },
      {
        path: "developers/sandbox",
        element: <WorkspaceRedirect to="security" search="?tab=network" />,
      },
      {
        path: "developers/providers",
        element: <WorkspaceRedirect to="models" search="?tab=apps" />,
      },
      {
        path: "developers/self-improving-skills",
        element: <WorkspaceRedirect to="governance" search="?tab=agents" />,
      },
      {
        // Legacy non–credit-priced programmatic usage page → Credits tab.
        path: "developers/credits-usage",
        element: (
          <WorkspaceRedirect to="credits" search="?tab=programmatic-usage" />
        ),
      },
    ],
  },
  {
    element: <RequirePermissionLayout verb="admin" resourceType="billing" />,
    children: [
      { path: "subscription", element: <SubscriptionPage /> },
      { path: "billing", element: <BillingPage /> },
    ],
  },
  {
    element: <RequirePermissionLayout verb="admin" resourceType="security" />,
    children: [
      { path: "security", element: <SecurityPage /> },
      {
        path: "identity-and-provisioning",
        element: <WorkspaceRedirect to="security" />,
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
