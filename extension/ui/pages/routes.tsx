import { ProtectedRoute } from "@app/ui/components/auth/ProtectedRoute";
import { ConversationPage } from "@app/ui/pages/ConversationPage";
import { LoginPage } from "@app/ui/pages/LoginPage";
import { MainPage } from "@app/ui/pages/MainPage";
import { RunPage } from "@app/ui/pages/RunPage";

export const routes = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "*",
    element: (
      <ProtectedRoute>
        {({ user, workspace, handleLogout }) => (
          <MainPage
            user={user}
            workspace={workspace}
            handleLogout={handleLogout}
          />
        )}
      </ProtectedRoute>
    ),
  },
  {
    path: "/conversations/:conversationId",
    element: (
      <ProtectedRoute>
        {({ user, workspace, handleLogout }) => (
          <ConversationPage
            user={user}
            workspace={workspace}
            handleLogout={handleLogout}
          />
        )}
      </ProtectedRoute>
    ),
  },
  {
    path: "/run",
    element: <ProtectedRoute>{() => <RunPage />}</ProtectedRoute>,
  },
];
