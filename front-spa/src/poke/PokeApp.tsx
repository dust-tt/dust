import { PokePage } from "@spa/poke/layouts/PokePage";
import { PokeWorkspacePage } from "@spa/poke/layouts/PokeWorkspacePage";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";

import RootLayout from "@dust-tt/front/components/app/RootLayout";
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

const router = createBrowserRouter(
  [
    {
      path: "/poke",
      element: <PokePage />,
      children: [
        // Static routes first
        {
          index: true,
          element: <DashboardPage />,
          handle: { title: "Home" },
        },
        {
          path: "kill",
          element: <KillPage />,
          handle: { title: "Kill Switches" },
        },
        {
          path: "plans",
          element: <PlansPage />,
          handle: { title: "Plans" },
        },
        {
          path: "pokefy",
          element: <PokefyPage />,
          handle: { title: "Pokefy" },
        },
        {
          path: "production-checks",
          element: <ProductionChecksPage />,
          handle: { title: "Production Checks" },
        },
        {
          path: "email-templates",
          element: <EmailTemplatesPage />,
          handle: { title: "Email Templates" },
        },
        {
          path: "templates",
          element: <TemplatesListPage />,
          handle: { title: "Templates" },
        },
        {
          path: "templates/:tId",
          element: <TemplateDetailPage />,
          handle: { title: "Template" },
        },
        {
          path: "plugins",
          element: <PluginsPage />,
          handle: { title: "Plugins" },
        },
        {
          path: "connectors/:connectorId",
          element: <ConnectorRedirectPage />,
          handle: { title: "Connector Redirect" },
        },
      ],
    },
    {
      path: "/poke/:wId",
      element: <PokeWorkspacePage />,
      children: [
        // Dynamic workspace routes
        {
          index: true,
          element: <WorkspacePage />,
          handle: { title: "Workspace" },
        },
        {
          path: "memberships",
          element: <MembershipsPage />,
          handle: { title: "Memberships" },
        },
        {
          path: "llm-traces/:runId",
          element: <LLMTracePage />,
          handle: { title: "LLM Trace" },
        },
        {
          path: "assistants/:aId",
          element: <AssistantDetailsPage />,
          handle: { title: "Assistant" },
        },
        {
          path: "assistants/:aId/triggers/:triggerId",
          element: <TriggerDetailsPage />,
          handle: { title: "Trigger" },
        },
        {
          path: "conversation/:cId",
          element: <ConversationPage />,
          handle: { title: "Conversation" },
        },
        {
          path: "data_sources/:dsId",
          element: <DataSourcePage />,
          handle: { title: "Data Source" },
        },
        {
          path: "data_sources/:dsId/notion-requests",
          element: <NotionRequestsPage />,
          handle: { title: "Notion Requests" },
        },
        {
          path: "data_sources/:dsId/query",
          element: <DataSourceQueryPage />,
          handle: { title: "Query" },
        },
        {
          path: "data_sources/:dsId/search",
          element: <DataSourceSearchPage />,
          handle: { title: "Search" },
        },
        {
          path: "data_sources/:dsId/view",
          element: <DataSourceViewPage />,
          handle: { title: "View Document" },
        },
        {
          path: "groups/:groupId",
          element: <GroupPage />,
          handle: { title: "Group" },
        },
        {
          path: "skills/:sId",
          element: <SkillDetailsPage />,
          handle: { title: "Skill" },
        },
        {
          path: "spaces/:spaceId",
          element: <SpacePage />,
          handle: { title: "Space" },
        },
        {
          path: "spaces/:spaceId/apps/:appId",
          element: <AppPage />,
          handle: { title: "App" },
        },
        {
          path: "spaces/:spaceId/data_source_views/:dsvId",
          element: <SpaceDataSourceViewPage />,
          handle: { title: "Data Source View" },
        },
        {
          path: "spaces/:spaceId/mcp_server_views/:svId",
          element: <MCPServerViewPage />,
          handle: { title: "MCP Server View" },
        },
      ],
    },
    {
      path: "*",
      element: <Navigate to="/poke" replace />,
    },
  ],
  {
    basename: import.meta.env.VITE_BASE_PATH ?? "",
  }
);

export default function PokeApp() {
  return (
    <RootLayout>
      <RouterProvider router={router} />
    </RootLayout>
  );
}
