import { ProtectedRoute } from "@extension/components/auth/ProtectedRoute";
import { ConversationPage } from "@extension/pages/ConversationPage";
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
    path: "/conversation",
    element: (
      <ProtectedRoute>
        <ConversationPage />
      </ProtectedRoute>
    ),
  },
];
