import { Notification } from "@dust-tt/sparkle";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";

import { AppPage } from "@app/components/poke/pages/AppPage";
import { AssistantDetailsPage } from "@app/components/poke/pages/AssistantDetailsPage";
import { ConnectorRedirectPage } from "@app/components/poke/pages/ConnectorRedirectPage";
import { ConversationPage } from "@app/components/poke/pages/ConversationPage";
import { DashboardPage } from "@app/components/poke/pages/DashboardPage";
import { DataSourcePage } from "@app/components/poke/pages/DataSourcePage";
import { DataSourceQueryPage } from "@app/components/poke/pages/DataSourceQueryPage";
import { DataSourceSearchPage } from "@app/components/poke/pages/DataSourceSearchPage";
import { DataSourceViewPage } from "@app/components/poke/pages/DataSourceViewPage";
import { EmailTemplatesPage } from "@app/components/poke/pages/EmailTemplatesPage";
import { GroupPage } from "@app/components/poke/pages/GroupPage";
import { KillPage } from "@app/components/poke/pages/KillPage";
import { LLMTracePage } from "@app/components/poke/pages/LLMTracePage";
import { MCPServerViewPage } from "@app/components/poke/pages/MCPServerViewPage";
import { MembershipsPage } from "@app/components/poke/pages/MembershipsPage";
import { NotionRequestsPage } from "@app/components/poke/pages/NotionRequestsPage";
import { PlansPage } from "@app/components/poke/pages/PlansPage";
import { PluginsPage } from "@app/components/poke/pages/PluginsPage";
import { PokefyPage } from "@app/components/poke/pages/PokefyPage";
import { ProductionChecksPage } from "@app/components/poke/pages/ProductionChecksPage";
import { SkillDetailsPage } from "@app/components/poke/pages/SkillDetailsPage";
import { SpaceDataSourceViewPage } from "@app/components/poke/pages/SpaceDataSourceViewPage";
import { SpacePage } from "@app/components/poke/pages/SpacePage";
import { TemplateDetailPage } from "@app/components/poke/pages/TemplateDetailPage";
import { TemplatesListPage } from "@app/components/poke/pages/TemplatesListPage";
import { TriggerDetailsPage } from "@app/components/poke/pages/TriggerDetailsPage";
import { WorkspacePage } from "@app/components/poke/pages/WorkspacePage";

import { PokeLayout } from "./layouts/PokeLayout";

const router = createBrowserRouter(
  [
    {
      path: "/poke",
      element: <PokeLayout />,
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
        // Dynamic workspace routes
        {
          path: ":wId",
          element: <WorkspacePage />,
          handle: { title: "Workspace" },
        },
        {
          path: ":wId/memberships",
          element: <MembershipsPage />,
          handle: { title: "Memberships" },
        },
        {
          path: ":wId/llm-traces/:runId",
          element: <LLMTracePage />,
          handle: { title: "LLM Trace" },
        },
        {
          path: ":wId/assistants/:aId",
          element: <AssistantDetailsPage />,
          handle: { title: "Assistant" },
        },
        {
          path: ":wId/assistants/:aId/triggers/:triggerId",
          element: <TriggerDetailsPage />,
          handle: { title: "Trigger" },
        },
        {
          path: ":wId/conversation/:cId",
          element: <ConversationPage />,
          handle: { title: "Conversation" },
        },
        {
          path: ":wId/data_sources/:dsId",
          element: <DataSourcePage />,
          handle: { title: "Data Source" },
        },
        {
          path: ":wId/data_sources/:dsId/notion-requests",
          element: <NotionRequestsPage />,
          handle: { title: "Notion Requests" },
        },
        {
          path: ":wId/data_sources/:dsId/query",
          element: <DataSourceQueryPage />,
          handle: { title: "Query" },
        },
        {
          path: ":wId/data_sources/:dsId/search",
          element: <DataSourceSearchPage />,
          handle: { title: "Search" },
        },
        {
          path: ":wId/data_sources/:dsId/view",
          element: <DataSourceViewPage />,
          handle: { title: "View Document" },
        },
        {
          path: ":wId/groups/:groupId",
          element: <GroupPage />,
          handle: { title: "Group" },
        },
        {
          path: ":wId/skills/:sId",
          element: <SkillDetailsPage />,
          handle: { title: "Skill" },
        },
        {
          path: ":wId/spaces/:spaceId",
          element: <SpacePage />,
          handle: { title: "Space" },
        },
        {
          path: ":wId/spaces/:spaceId/apps/:appId",
          element: <AppPage />,
          handle: { title: "App" },
        },
        {
          path: ":wId/spaces/:spaceId/data_source_views/:dsvId",
          element: <SpaceDataSourceViewPage />,
          handle: { title: "Data Source View" },
        },
        {
          path: ":wId/spaces/:spaceId/mcp_server_views/:svId",
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

export default function App() {
  return (
    <Notification.Area>
      <RouterProvider router={router} />
    </Notification.Area>
  );
}
