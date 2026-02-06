import { AppReadyProvider } from "@spa/app/contexts/AppReadyContext";
import { PokePage } from "@spa/poke/layouts/PokePage";
import { PokeWorkspacePage } from "@spa/poke/layouts/PokeWorkspacePage";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useParams,
} from "react-router-dom";

import RootLayout from "@dust-tt/front/components/app/RootLayout";
import { RegionProvider } from "@dust-tt/front/lib/auth/RegionContext";

import { AppPage } from "@dust-tt/front/components/poke/pages/AppPage";
import { AssistantDetailsPage } from "@dust-tt/front/components/poke/pages/AssistantDetailsPage";
import { ConnectorRedirectPage } from "@dust-tt/front/components/poke/pages/ConnectorRedirectPage";
import { ConversationPage } from "@dust-tt/front/components/poke/pages/ConversationPage";
import { DashboardPage } from "@dust-tt/front/components/poke/pages/DashboardPage";
import { DataSourcePage } from "@dust-tt/front/components/poke/pages/DataSourcePage";
import { DataSourceQueryPage } from "@dust-tt/front/components/poke/pages/DataSourceQueryPage";
import { DataSourceSearchPage } from "@dust-tt/front/components/poke/pages/DataSourceSearchPage";
import { DataSourceViewPage } from "@dust-tt/front/components/poke/pages/DataSourceViewPage";
import { EmailTemplatesPage } from "@dust-tt/front/components/poke/pages/EmailTemplatesPage";
import { FramePage } from "@dust-tt/front/components/poke/pages/FramePage";
import { GroupPage } from "@dust-tt/front/components/poke/pages/GroupPage";
import { KillPage } from "@dust-tt/front/components/poke/pages/KillPage";
import { LLMTracePage } from "@dust-tt/front/components/poke/pages/LLMTracePage";
import { MCPServerViewPage } from "@dust-tt/front/components/poke/pages/MCPServerViewPage";
import { MembershipsPage } from "@dust-tt/front/components/poke/pages/MembershipsPage";
import { NotionRequestsPage } from "@dust-tt/front/components/poke/pages/NotionRequestsPage";
import { PlansPage } from "@dust-tt/front/components/poke/pages/PlansPage";
import { PluginsPage } from "@dust-tt/front/components/poke/pages/PluginsPage";
import { PokefyPage } from "@dust-tt/front/components/poke/pages/PokefyPage";
import { ProductionChecksPage } from "@dust-tt/front/components/poke/pages/ProductionChecksPage";
import { SkillDetailsPage } from "@dust-tt/front/components/poke/pages/SkillDetailsPage";
import { SpaceDataSourceViewPage } from "@dust-tt/front/components/poke/pages/SpaceDataSourceViewPage";
import { SpacePage } from "@dust-tt/front/components/poke/pages/SpacePage";
import { TemplateDetailPage } from "@dust-tt/front/components/poke/pages/TemplateDetailPage";
import { TemplatesListPage } from "@dust-tt/front/components/poke/pages/TemplatesListPage";
import { TriggerDetailsPage } from "@dust-tt/front/components/poke/pages/TriggerDetailsPage";
import { WorkspacePage } from "@dust-tt/front/components/poke/pages/WorkspacePage";
import { useLocation } from "react-router-dom";
import Custom404 from "@dust-tt/front/pages/404";

// Redirect component that strips /poke prefix
function PokeRedirect() {
  const params = useParams();
  const location = useLocation();
  const rest = params["*"] || "";
  return <Navigate to={`/${rest}${location.search}${location.hash}`} replace />;
}

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <PokePage />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: "kill", element: <KillPage /> },
        { path: "plans", element: <PlansPage /> },
        { path: "pokefy", element: <PokefyPage /> },
        { path: "production-checks", element: <ProductionChecksPage /> },
        { path: "email-templates", element: <EmailTemplatesPage /> },
        { path: "templates", element: <TemplatesListPage /> },
        { path: "templates/:tId", element: <TemplateDetailPage /> },
        { path: "plugins", element: <PluginsPage /> },
        { path: "connectors/:connectorId", element: <ConnectorRedirectPage /> },
      ],
    },
    { path: "/404", element: <Custom404 /> },
    {
      path: "/:wId",
      element: <PokeWorkspacePage />,
      children: [
        { index: true, element: <WorkspacePage /> },
        { path: "memberships", element: <MembershipsPage /> },
        { path: "llm-traces/:runId", element: <LLMTracePage /> },
        { path: "assistants/:aId", element: <AssistantDetailsPage /> },
        {
          path: "assistants/:aId/triggers/:triggerId",
          element: <TriggerDetailsPage />,
        },
        { path: "conversation/:cId", element: <ConversationPage /> },
        { path: "data_sources/:dsId", element: <DataSourcePage /> },
        {
          path: "data_sources/:dsId/notion-requests",
          element: <NotionRequestsPage />,
        },
        { path: "data_sources/:dsId/query", element: <DataSourceQueryPage /> },
        {
          path: "data_sources/:dsId/search",
          element: <DataSourceSearchPage />,
        },
        { path: "data_sources/:dsId/view", element: <DataSourceViewPage /> },
        { path: "groups/:groupId", element: <GroupPage /> },
        { path: "files/:sId", element: <FramePage /> },
        { path: "skills/:sId", element: <SkillDetailsPage /> },
        { path: "spaces/:spaceId", element: <SpacePage /> },
        { path: "spaces/:spaceId/apps/:appId", element: <AppPage /> },
        {
          path: "spaces/:spaceId/data_source_views/:dsvId",
          element: <SpaceDataSourceViewPage />,
        },
        {
          path: "spaces/:spaceId/mcp_server_views/:svId",
          element: <MCPServerViewPage />,
        },
      ],
    },
    // Redirect /poke/* to /* (strip /poke prefix)
    { path: "poke/*", element: <PokeRedirect /> },
    { path: "*", element: <Custom404 /> },
  ],
  {
    basename: import.meta.env.VITE_BASE_PATH ?? "",
  }
);

export default function PokeApp() {
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
