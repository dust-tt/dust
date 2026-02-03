import { ConversationLayoutWrapper } from "@spa/app/layouts/ConversationLayoutWrapper";
import { WorkspacePage } from "@spa/app/layouts/WorkspacePage";
import { IndexPage } from "@spa/app/pages/IndexPage";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";

import RootLayout from "@dust-tt/front/components/app/RootLayout";
import { AnalyticsPage } from "@dust-tt/front/components/pages/workspace/AnalyticsPage";
import { APIKeysPage } from "@dust-tt/front/components/pages/workspace/developers/APIKeysPage";
import { CreditsUsagePage } from "@dust-tt/front/components/pages/workspace/developers/CreditsUsagePage";
import { ProvidersPage } from "@dust-tt/front/components/pages/workspace/developers/ProvidersPage";
import { SecretsPage } from "@dust-tt/front/components/pages/workspace/developers/SecretsPage";
import { LabsPage } from "@dust-tt/front/components/pages/workspace/labs/LabsPage";
import { AgentMCPActionsPage } from "@dust-tt/front/components/pages/workspace/labs/mcp_actions/AgentMCPActionsPage";
import { MCPActionsDashboardPage } from "@dust-tt/front/components/pages/workspace/labs/mcp_actions/MCPActionsDashboardPage";
import { TranscriptsPage } from "@dust-tt/front/components/pages/workspace/labs/TranscriptsPage";
import { MembersPage } from "@dust-tt/front/components/pages/workspace/MembersPage";
import { ProfilePage } from "@dust-tt/front/components/pages/workspace/ProfilePage";
import { ManageSubscriptionPage } from "@dust-tt/front/components/pages/workspace/subscription/ManageSubscriptionPage";
import { PaymentProcessingPage } from "@dust-tt/front/components/pages/workspace/subscription/PaymentProcessingPage";
import { SubscriptionPage } from "@dust-tt/front/components/pages/workspace/subscription/SubscriptionPage";
import { WorkspaceSettingsPage } from "@dust-tt/front/components/pages/workspace/WorkspaceSettingsPage";

// Conversation pages
import { ConversationPage } from "@dust-tt/front/components/pages/conversation/ConversationPage";
import { SpaceConversationsPage } from "@dust-tt/front/components/pages/conversation/SpaceConversationsPage";

// Space pages
import { DataSourceViewPage } from "@dust-tt/front/components/pages/spaces/DataSourceViewPage";
import { SpaceActionsPage } from "@dust-tt/front/components/pages/spaces/SpaceActionsPage";
import { SpaceAppsListPage } from "@dust-tt/front/components/pages/spaces/SpaceAppsListPage";
import { SpaceCategoryPage } from "@dust-tt/front/components/pages/spaces/SpaceCategoryPage";
import { SpacePage } from "@dust-tt/front/components/pages/spaces/SpacePage";
import { SpacesRedirectPage } from "@dust-tt/front/components/pages/spaces/SpacesRedirectPage";
import { SpaceTriggersPage } from "@dust-tt/front/components/pages/spaces/SpaceTriggersPage";

// App pages
import { AppSettingsPage } from "@dust-tt/front/components/pages/spaces/apps/AppSettingsPage";
import { AppSpecificationPage } from "@dust-tt/front/components/pages/spaces/apps/AppSpecificationPage";
import { AppViewPage } from "@dust-tt/front/components/pages/spaces/apps/AppViewPage";
import { DatasetPage } from "@dust-tt/front/components/pages/spaces/apps/DatasetPage";
import { DatasetsPage } from "@dust-tt/front/components/pages/spaces/apps/DatasetsPage";
import { NewDatasetPage } from "@dust-tt/front/components/pages/spaces/apps/NewDatasetPage";
import { RunPage } from "@dust-tt/front/components/pages/spaces/apps/RunPage";
import { RunsPage } from "@dust-tt/front/components/pages/spaces/apps/RunsPage";
import { AdminLayout } from "@spa/app/layouts/AdminLayout";

const router = createBrowserRouter(
  [
    { path: "/", element: <IndexPage /> },
    {
      path: "/w/:wId",
      element: <WorkspacePage />,
      children: [
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
          path: "",
          element: <AdminLayout />,
          children: [
            { path: "members", element: <MembersPage /> },
            { path: "workspace", element: <WorkspaceSettingsPage /> },
            { path: "analytics", element: <AnalyticsPage /> },
            { path: "subscription", element: <SubscriptionPage /> },
            { path: "subscription/manage", element: <ManageSubscriptionPage /> },
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
        { path: "spaces/:spaceId", element: <SpacePage /> },
        {
          path: "spaces/:spaceId/categories/actions",
          element: <SpaceActionsPage />,
        },
        {
          path: "spaces/:spaceId/categories/apps",
          element: <SpaceAppsListPage />,
        },
        {
          path: "spaces/:spaceId/categories/triggers",
          element: <SpaceTriggersPage />,
        },
        {
          path: "spaces/:spaceId/categories/:category",
          element: <SpaceCategoryPage />,
        },
        {
          path: "spaces/:spaceId/categories/:category/data_source_views/:dataSourceViewId",
          element: <DataSourceViewPage />,
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
      ],
    },
    { path: "*", element: <Navigate to="/" replace /> },
  ],
  {
    basename: import.meta.env.VITE_BASE_PATH ?? "",
  }
);

export default function App() {
  return (
    <RootLayout>
      <RouterProvider router={router} />
    </RootLayout>
  );
}
