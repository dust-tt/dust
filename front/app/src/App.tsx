import { Notification } from "@dust-tt/sparkle";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";

import { PokeLayout } from "./layouts/PokeLayout";
import {
  PokeAppPageWrapper,
  PokeAssistantDetailsPageWrapper,
  PokeConversationPageWrapper,
  PokeDashboardPageWrapper,
  PokeDataSourcePageWrapper,
  PokeDataSourceQueryPageWrapper,
  PokeDataSourceSearchPageWrapper,
  PokeDataSourceViewPageWrapper,
  PokeEmailTemplatesPageWrapper,
  PokeGroupPageWrapper,
  PokeKillPageWrapper,
  PokeLLMTracePageWrapper,
  PokeMCPServerViewPageWrapper,
  PokeMembershipsPageWrapper,
  PokeNotionRequestsPageWrapper,
  PokePlansPageWrapper,
  PokePluginsPageWrapper,
  PokePokefyPageWrapper,
  PokeProductionChecksPageWrapper,
  PokeSkillDetailsPageWrapper,
  PokeSpaceDataSourceViewPageWrapper,
  PokeSpacePageWrapper,
  PokeTemplateDetailPageWrapper,
  PokeTemplatesListPageWrapper,
  PokeTriggerDetailsPageWrapper,
  PokeWorkspacePageWrapper,
} from "./pages/poke/wrappers";

const router = createBrowserRouter(
  [
    // Poke routes (superuser only) - static routes first, then dynamic :wId
    {
      path: "/poke",
      element: <PokeLayout title="Poke" />,
      children: [
        {
          index: true,
          element: <PokeDashboardPageWrapper />,
        },
      ],
    },
    {
      path: "/poke/kill",
      element: <PokeLayout title="Kill Switches" />,
      children: [
        {
          index: true,
          element: <PokeKillPageWrapper />,
        },
      ],
    },
    {
      path: "/poke/plans",
      element: <PokeLayout title="Plans" />,
      children: [
        {
          index: true,
          element: <PokePlansPageWrapper />,
        },
      ],
    },
    {
      path: "/poke/pokefy",
      element: <PokeLayout title="Pokefy" />,
      children: [
        {
          index: true,
          element: <PokePokefyPageWrapper />,
        },
      ],
    },
    {
      path: "/poke/production-checks",
      element: <PokeLayout title="Production Checks" />,
      children: [
        {
          index: true,
          element: <PokeProductionChecksPageWrapper />,
        },
      ],
    },
    {
      path: "/poke/email-templates",
      element: <PokeLayout title="Email Templates" />,
      children: [
        {
          index: true,
          element: <PokeEmailTemplatesPageWrapper />,
        },
      ],
    },
    {
      path: "/poke/templates",
      element: <PokeLayout title="Templates" />,
      children: [
        {
          index: true,
          element: <PokeTemplatesListPageWrapper />,
        },
        {
          path: ":tId",
          element: <PokeTemplateDetailPageWrapper />,
        },
      ],
    },
    {
      path: "/poke/plugins",
      element: <PokeLayout title="Plugins" />,
      children: [
        {
          index: true,
          element: <PokePluginsPageWrapper />,
        },
      ],
    },
    // Dynamic workspace routes must come after static routes
    {
      path: "/poke/:wId",
      element: <PokeLayout title="Workspace" />,
      children: [
        {
          index: true,
          element: <PokeWorkspacePageWrapper />,
        },
        {
          path: "memberships",
          element: <PokeMembershipsPageWrapper />,
        },
        {
          path: "llm-traces/:runId",
          element: <PokeLLMTracePageWrapper />,
        },
        {
          path: "assistants/:aId",
          element: <PokeAssistantDetailsPageWrapper />,
        },
        {
          path: "assistants/:aId/triggers/:triggerId",
          element: <PokeTriggerDetailsPageWrapper />,
        },
        {
          path: "conversation/:cId",
          element: <PokeConversationPageWrapper />,
        },
        {
          path: "data_sources/:dsId",
          element: <PokeDataSourcePageWrapper />,
        },
        {
          path: "data_sources/:dsId/notion-requests",
          element: <PokeNotionRequestsPageWrapper />,
        },
        {
          path: "data_sources/:dsId/query",
          element: <PokeDataSourceQueryPageWrapper />,
        },
        {
          path: "data_sources/:dsId/search",
          element: <PokeDataSourceSearchPageWrapper />,
        },
        {
          path: "data_sources/:dsId/view",
          element: <PokeDataSourceViewPageWrapper />,
        },
        {
          path: "groups/:groupId",
          element: <PokeGroupPageWrapper />,
        },
        {
          path: "skills/:sId",
          element: <PokeSkillDetailsPageWrapper />,
        },
        {
          path: "spaces/:spaceId",
          element: <PokeSpacePageWrapper />,
        },
        {
          path: "spaces/:spaceId/apps/:appId",
          element: <PokeAppPageWrapper />,
        },
        {
          path: "spaces/:spaceId/data_source_views/:dsvId",
          element: <PokeSpaceDataSourceViewPageWrapper />,
        },
        {
          path: "spaces/:spaceId/mcp_server_views/:svId",
          element: <PokeMCPServerViewPageWrapper />,
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
