import { ProtectedRoute } from "@extension/ui/components/auth/ProtectedRoute";
import { LoginPage } from "@extension/ui/pages/LoginPage";
import { MainPage } from "@extension/ui/pages/MainPage";
import { ProjectMainPage } from "@extension/ui/pages/ProjectMainPage";
import { RunPage } from "@extension/ui/pages/RunPage";
import { SubscribePage } from "@extension/ui/pages/SubscribePage";

export const routes = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/run",
        element: <RunPage />,
      },
      {
        path: "/subscribe",
        element: <SubscribePage />,
      },
      {
        path: "/w/:wId/conversation/space/:spaceId",
        element: <ProjectMainPage />,
      },
      // Keep catch-all route last. This will handle both root path and /conversations/:conversationId
      // Since we catch all, we will need to manually handle the conversationId in the MainPage component.
      {
        path: "*",
        element: <MainPage />,
      },
    ],
  },
];
