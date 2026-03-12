import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";

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

export const labsRoutes: RouteObject[] = [
  { path: "labs", element: <LabsPage /> },
  { path: "labs/transcripts", element: <TranscriptsPage /> },
  {
    path: "labs/mcp_actions",
    element: <MCPActionsDashboardPage />,
  },
  {
    path: "labs/mcp_actions/:agentId",
    element: <AgentMCPActionsPage />,
  },
];
