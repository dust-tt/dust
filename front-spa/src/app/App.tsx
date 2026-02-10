import { AppReadyProvider } from "@spa/app/contexts/AppReadyContext";
import { AdminLayout } from "@spa/app/layouts/AdminLayout";
import { ConversationLayoutWrapper } from "@spa/app/layouts/ConversationLayoutWrapper";
import { SpaceLayoutWrapper } from "@spa/app/layouts/SpaceLayoutWrapper";
import { UnauthenticatedPage } from "@spa/app/layouts/UnauthenticatedPage";
import { WorkspacePage } from "@spa/app/layouts/WorkspacePage";
import { IndexPage } from "@spa/app/pages/IndexPage";
import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useLocation,
} from "react-router-dom";

import RootLayout from "@dust-tt/front/components/app/RootLayout";
import { RegionProvider } from "@dust-tt/front/lib/auth/RegionContext";
import Custom404 from "@dust-tt/front/pages/404";

// Redirect component that preserves query params and hash
function RedirectWithSearchParams({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
    </div>
  );
}

// Helper to wrap lazy components with Suspense.
// On chunk load failure (typically after a deploy replaces old assets),
// automatically reload to get fresh assets.
function withSuspense(
  importFn: () => Promise<Record<string, unknown>>,
  exportName?: string
) {
  const LazyComponent = lazy(() =>
    importFn()
      .catch(() => {
        window.location.reload();
        return new Promise<Record<string, unknown>>(() => {});
      })
      .then((module) => ({
        default: (exportName
          ? module[exportName]
          : module.default) as React.ComponentType,
      }))
  );
  return function SuspenseWrapper() {
    return (
      <Suspense fallback={<PageLoader />}>
        <LazyComponent />
      </Suspense>
    );
  };
}

// Workspace pages (lazy loaded)
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
const LabsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/labs/LabsPage"),
  "LabsPage"
);
const AgentMCPActionsPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/labs/mcp_actions/AgentMCPActionsPage"
    ),
  "AgentMCPActionsPage"
);
const MCPActionsDashboardPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/labs/mcp_actions/MCPActionsDashboardPage"
    ),
  "MCPActionsDashboardPage"
);
const TranscriptsPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/workspace/labs/TranscriptsPage"),
  "TranscriptsPage"
);
const MembersPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/MembersPage"),
  "MembersPage"
);
const ProfilePage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/ProfilePage"),
  "ProfilePage"
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

// Conversation pages (lazy loaded)
const ConversationPage = withSuspense(
  () => import("@dust-tt/front/components/pages/conversation/ConversationPage"),
  "ConversationPage"
);
const SpaceConversationsPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/conversation/SpaceConversationsPage"
    ),
  "SpaceConversationsPage"
);

// Space pages (lazy loaded)
const DataSourceViewPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/DataSourceViewPage"),
  "DataSourceViewPage"
);
const SpaceActionsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/SpaceActionsPage"),
  "SpaceActionsPage"
);
const SpaceAppsListPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/SpaceAppsListPage"),
  "SpaceAppsListPage"
);
const SpaceCategoryPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/SpaceCategoryPage"),
  "SpaceCategoryPage"
);
const SpacePage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/SpacePage"),
  "SpacePage"
);
const SpacesRedirectPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/SpacesRedirectPage"),
  "SpacesRedirectPage"
);
const SpaceTriggersPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/SpaceTriggersPage"),
  "SpaceTriggersPage"
);

// App pages (lazy loaded)
const AppSettingsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/AppSettingsPage"),
  "AppSettingsPage"
);
const AppSpecificationPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/spaces/apps/AppSpecificationPage"),
  "AppSpecificationPage"
);
const AppViewPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/AppViewPage"),
  "AppViewPage"
);
const DatasetPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/DatasetPage"),
  "DatasetPage"
);
const DatasetsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/DatasetsPage"),
  "DatasetsPage"
);
const NewDatasetPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/NewDatasetPage"),
  "NewDatasetPage"
);
const RunPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/RunPage"),
  "RunPage"
);
const RunsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/RunsPage"),
  "RunsPage"
);

// Builder/Agents pages (lazy loaded)
const CreateAgentPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/builder/agents/CreateAgentPage"),
  "CreateAgentPage"
);
const EditAgentPage = withSuspense(
  () => import("@dust-tt/front/components/pages/builder/agents/EditAgentPage"),
  "EditAgentPage"
);
const ManageAgentsPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/builder/agents/ManageAgentsPage"),
  "ManageAgentsPage"
);
const NewAgentPage = withSuspense(
  () => import("@dust-tt/front/components/pages/builder/agents/NewAgentPage"),
  "NewAgentPage"
);

// Builder/Skills pages (lazy loaded)
const CreateSkillPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/builder/skills/CreateSkillPage"),
  "CreateSkillPage"
);
const EditSkillPage = withSuspense(
  () => import("@dust-tt/front/components/pages/builder/skills/EditSkillPage"),
  "EditSkillPage"
);
const ManageSkillsPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/builder/skills/ManageSkillsPage"),
  "ManageSkillsPage"
);

// Onboarding pages (lazy loaded)
const WelcomePage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/WelcomePage"),
  "WelcomePage"
);
const SubscribePage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/SubscribePage"),
  "SubscribePage"
);
const TrialPage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/TrialPage"),
  "TrialPage"
);
const TrialEndedPage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/TrialEndedPage"),
  "TrialEndedPage"
);
const VerifyPage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/VerifyPage"),
  "VerifyPage"
);
const JoinPage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/JoinPage"),
  "JoinPage"
);
const LoginErrorPage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/LoginErrorPage"),
  "LoginErrorPage"
);

const router = createBrowserRouter(
  [
    { path: "/", element: <IndexPage /> },
    {
      path: "/w/:wId",
      element: <WorkspacePage />,
      children: [
        // Index - redirect to conversation/new
        {
          index: true,
          element: <RedirectWithSearchParams to="conversation/new" />,
        },

        // Profile
        { path: "me", element: <ProfilePage /> },

        // Conversation (wrapped with ConversationLayout)
        {
          path: "conversation",
          element: <ConversationLayoutWrapper />,
          children: [
            { path: ":cId", element: <ConversationPage /> },
            { path: "space/:spaceId", element: <SpaceConversationsPage /> },
          ],
        },

        {
          element: <AdminLayout />,
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
            { path: "developers/credits-usage", element: <CreditsUsagePage /> },
            { path: "developers/providers", element: <ProvidersPage /> },
            { path: "developers/dev-secrets", element: <SecretsPage /> },
          ],
        },

        // Labs
        { path: "labs", element: <LabsPage /> },
        { path: "labs/transcripts", element: <TranscriptsPage /> },
        { path: "labs/mcp_actions", element: <MCPActionsDashboardPage /> },
        {
          path: "labs/mcp_actions/:agentId",
          element: <AgentMCPActionsPage />,
        },

        // Spaces
        { path: "spaces", element: <SpacesRedirectPage /> },
        {
          path: "spaces/:spaceId",
          element: <SpaceLayoutWrapper />,
          children: [
            { index: true, element: <SpacePage /> },
            { path: "categories/actions", element: <SpaceActionsPage /> },
            { path: "categories/apps", element: <SpaceAppsListPage /> },
            { path: "categories/triggers", element: <SpaceTriggersPage /> },
            { path: "categories/:category", element: <SpaceCategoryPage /> },
            {
              path: "categories/:category/data_source_views/:dataSourceViewId",
              element: <DataSourceViewPage />,
            },
          ],
        },

        // Apps
        { path: "spaces/:spaceId/apps/:aId", element: <AppViewPage /> },
        {
          path: "spaces/:spaceId/apps/:aId/settings",
          element: <AppSettingsPage />,
        },
        {
          path: "spaces/:spaceId/apps/:aId/specification",
          element: <AppSpecificationPage />,
        },
        {
          path: "spaces/:spaceId/apps/:aId/datasets",
          element: <DatasetsPage />,
        },
        {
          path: "spaces/:spaceId/apps/:aId/datasets/new",
          element: <NewDatasetPage />,
        },
        {
          path: "spaces/:spaceId/apps/:aId/datasets/:name",
          element: <DatasetPage />,
        },
        { path: "spaces/:spaceId/apps/:aId/runs", element: <RunsPage /> },
        { path: "spaces/:spaceId/apps/:aId/runs/:runId", element: <RunPage /> },

        // Builder/Agents
        { path: "builder/agents", element: <ManageAgentsPage /> },
        { path: "builder/agents/create", element: <CreateAgentPage /> },
        { path: "builder/agents/new", element: <NewAgentPage /> },
        { path: "builder/agents/:aId", element: <EditAgentPage /> },

        // Builder/Skills
        { path: "builder/skills", element: <ManageSkillsPage /> },
        { path: "builder/skills/new", element: <CreateSkillPage /> },
        { path: "builder/skills/:sId", element: <EditSkillPage /> },

        // Onboarding
        { path: "welcome", element: <WelcomePage /> },
        { path: "subscribe", element: <SubscribePage /> },
        { path: "trial", element: <TrialPage /> },
        { path: "trial-ended", element: <TrialEndedPage /> },
        { path: "verify", element: <VerifyPage /> },
      ],
    },
    {
      element: <UnauthenticatedPage />,
      children: [
        { path: "/w/:wId/join", element: <JoinPage /> },
        { path: "/login-error", element: <LoginErrorPage /> },
        { path: "*", element: <Custom404 /> },
      ],
    },
  ],
  {
    basename: import.meta.env?.VITE_BASE_PATH ?? "",
  }
);

export default function App() {
  return (
    <AppReadyProvider>
      <RegionProvider>
        <RootLayout>
          <RouterProvider router={router} />
        </RootLayout>
      </RegionProvider>
    </AppReadyProvider>
  );
}
