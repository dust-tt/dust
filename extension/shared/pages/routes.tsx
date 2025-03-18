import { ProtectedRoute } from "@extension/components/auth/ProtectedRoute";
import { ConversationPage } from "@extension/pages/ConversationPage";
import { LoginPage } from "@extension/pages/LoginPage";
import { MainPage } from "@extension/pages/MainPage";
import { RunPage } from "@extension/pages/RunPage";

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
