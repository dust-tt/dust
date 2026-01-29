import { WorkspacePage } from "@spa/app/layouts/WorkspacePage";
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

const router = createBrowserRouter(
  [
    {
      path: "/w/:wId",
      element: <WorkspacePage />,
      children: [
        // Profile
        { path: "me", element: <ProfilePage /> },

        // Workspace settings
        { path: "workspace", element: <WorkspaceSettingsPage /> },

        // Members
        { path: "members", element: <MembersPage /> },

        // Analytics
        { path: "analytics", element: <AnalyticsPage /> },

        // Subscription
        { path: "subscription", element: <SubscriptionPage /> },
        { path: "subscription/manage", element: <ManageSubscriptionPage /> },
        {
          path: "subscription/payment_processing",
          element: <PaymentProcessingPage />,
        },

        // Developers
        { path: "developers/api-keys", element: <APIKeysPage /> },
        { path: "developers/credits-usage", element: <CreditsUsagePage /> },
        { path: "developers/providers", element: <ProvidersPage /> },
        { path: "developers/dev-secrets", element: <SecretsPage /> },

        // Labs
        { path: "labs", element: <LabsPage /> },
        { path: "labs/transcripts", element: <TranscriptsPage /> },
        { path: "labs/mcp_actions", element: <MCPActionsDashboardPage /> },
        {
          path: "labs/mcp_actions/:agentId",
          element: <AgentMCPActionsPage />,
        },
      ],
    },
    { path: "*", element: <Navigate to="/w/DevWkSpace/me" replace /> },
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
