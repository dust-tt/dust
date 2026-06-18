import { ConversationRouterLayout } from "@spa/app/layouts/ConversationRouterLayout";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";
import { Navigate, useLocation, useParams } from "react-router-dom";

function RedirectWithSearchParams({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

// Redirect legacy conversation URLs (/w/:wId/assistant/:cId and /w/:wId/agent/:cId) to the current
// /w/:wId/conversation/:cId, preserving query params and hash. The deployed Cloudflare worker
// issues a real 301 for these paths, but the worker does not run under the Vite dev/preview server,
// so this client-side redirect guarantees the behavior in every environment.
function ConversationRedirect() {
  const { wId, cId } = useParams();
  const location = useLocation();
  return (
    <Navigate
      to={`/w/${wId}/conversation/${cId}${location.search}${location.hash}`}
      replace
    />
  );
}

const ConversationPage = withSuspense(
  () => import("@dust-tt/front/components/pages/conversation/ConversationPage"),
  "ConversationPage"
);

export const conversationRoutes: RouteObject[] = [
  // Workspace index redirects to conversation/new
  {
    index: true,
    element: <RedirectWithSearchParams to="conversation/new" />,
  },
  {
    path: "conversation",
    element: <ConversationRouterLayout />,
    children: [{ path: ":cId", element: <ConversationPage /> }],
  },
];

// Legacy conversation URL redirects: /assistant/:cId and /agent/:cId -> /conversation/:cId.
export const conversationRedirectRoutes: RouteObject[] = [
  {
    path: "assistant/:cId",
    element: <ConversationRedirect />,
  },
  {
    path: "agent/:cId",
    element: <ConversationRedirect />,
  },
];
