import { ConversationPage } from "@app/extension/app/src/pages/ConversationPage";
import { ProtectedRoute } from "@extension/components/auth/ProtectedRoute";
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
        <MainPage />,
      </ProtectedRoute>
    ),
  },
  {
    path: "/conversations/:conversationId",
    element: (
      <ProtectedRoute>
        <ConversationPage />
      </ProtectedRoute>
    ),
  },
];
