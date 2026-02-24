import { ProtectedRoute } from "@extension/ui/components/auth/ProtectedRoute";
import { LoginPage } from "@extension/ui/pages/LoginPage";
import { MainPage } from "@extension/ui/pages/MainPage";
import { RunPage } from "@extension/ui/pages/RunPage";
import { SubscribePage } from "@extension/ui/pages/SubscribePage";

export const routes = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/run",
    element: <ProtectedRoute>{() => <RunPage />}</ProtectedRoute>,
  },
  {
    path: "/subscribe",
    element: (
      <ProtectedRoute>
        {({ user, workspace, handleLogout }) => (
          <SubscribePage
            user={user}
            workspace={workspace}
            handleLogout={handleLogout}
          />
        )}
      </ProtectedRoute>
    ),
  },
  // Keep catch-all route last. This will handle both root path and /conversations/:conversationId
  // Since we catch all, we will need to manually handle the conversationId in the MainPage component.
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
];
