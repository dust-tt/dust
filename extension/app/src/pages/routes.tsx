import { ProtectedRoute } from "@extension/components/auth/ProtectedRoute";
import { ConversationPage } from "@extension/pages/ConversationPage";
import { ConversationsPage } from "@extension/pages/ConversationsPage";
import { LoginPage } from "@extension/pages/LoginPage";
import { MainPage } from "@extension/pages/MainPage";

export const routes = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "*",
    element: (
      <ProtectedRoute>
        {({ user, workspace }) => (
          <MainPage user={user} workspace={workspace} />
        )}
      </ProtectedRoute>
    ),
  },
  {
    path: "/conversations/:conversationId",
    element: (
      <ProtectedRoute>
        {({ user, workspace }) => (
          <ConversationPage user={user} workspace={workspace} />
        )}
      </ProtectedRoute>
    ),
  },
  {
    path: "/conversations",
    element: (
      <ProtectedRoute>
        {({ user, workspace }) => (
          <ConversationsPage user={user} workspace={workspace} />
        )}
      </ProtectedRoute>
    ),
  },
];
