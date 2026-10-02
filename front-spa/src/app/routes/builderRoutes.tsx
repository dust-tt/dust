import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";
import { Navigate, useLocation, useParams } from "react-router-dom";

// Redirect component that preserves query params and hash
function RedirectWithSearchParams({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

// Redirect component for /builder/assistants/:aId -> /builder/agents/:aId
function AssistantAgentRedirect() {
  const { aId } = useParams();
  const location = useLocation();
  return (
    <Navigate
      to={`../builder/agents/${aId}${location.search}${location.hash}`}
      replace
    />
  );
}

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

// Management routes: inside AppContentLayout and sharing the agent sidebar, so they hang off
// AgentSurfaceRouterLayout alongside the conversation and Pod routes.
export const builderAgentSurfaceRoutes: RouteObject[] = [
  { path: "builder/agents", element: <ManageAgentsPage /> },
  { path: "builder/skills", element: <ManageSkillsPage /> },
];

// Builder routes inside AppContentLayout but without the agent sidebar.
export const builderContentRoutes: RouteObject[] = [
  { path: "builder/agents/create", element: <CreateAgentPage /> },
];

// Builder routes outside AppContentLayout (full-page editors without sidebar)
export const builderFullPageRoutes: RouteObject[] = [
  { path: "builder/agents/new", element: <NewAgentPage /> },
  { path: "builder/agents/:aId", element: <EditAgentPage /> },
  { path: "builder/skills/new", element: <CreateSkillPage /> },
  { path: "builder/skills/:sId", element: <EditSkillPage /> },
];

// Legacy assistants -> agents redirects
export const builderRedirectRoutes: RouteObject[] = [
  {
    path: "builder/assistants",
    element: <RedirectWithSearchParams to="../builder/agents" />,
  },
  {
    path: "builder/assistants/create",
    element: <RedirectWithSearchParams to="../builder/agents/create" />,
  },
  {
    path: "builder/assistants/new",
    element: <RedirectWithSearchParams to="../builder/agents/new" />,
  },
  {
    path: "builder/assistants/dust",
    element: (
      <RedirectWithSearchParams to="../builder/agents#?selectedTab=global" />
    ),
  },
  {
    path: "builder/assistants/:aId",
    element: <AssistantAgentRedirect />,
  },
];
