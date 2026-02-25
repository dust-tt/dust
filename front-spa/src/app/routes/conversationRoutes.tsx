import { ConversationRouterLayout } from "@spa/app/layouts/ConversationRouterLayout";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";
import { Navigate, useLocation } from "react-router-dom";

function RedirectWithSearchParams({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

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

export const conversationRoutes: RouteObject[] = [
  // Workspace index redirects to conversation/new
  {
    index: true,
    element: <RedirectWithSearchParams to="conversation/new" />,
  },
  {
    path: "conversation",
    element: <ConversationRouterLayout />,
    children: [
      { path: ":cId", element: <ConversationPage /> },
      {
        path: "space/:spaceId",
        element: <SpaceConversationsPage />,
      },
    ],
  },
];
