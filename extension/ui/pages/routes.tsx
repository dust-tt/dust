import { ProtectedRoute } from "@extension/ui/components/auth/ProtectedRoute";
import { ErrorFallback } from "@extension/ui/components/ErrorFallback";
import { LoginPage } from "@extension/ui/pages/LoginPage";
import { MainPage } from "@extension/ui/pages/MainPage";
import { PodMainPage } from "@extension/ui/pages/PodMainPage";
import { RunPage } from "@extension/ui/pages/RunPage";
import { SubscribePage } from "@extension/ui/pages/SubscribePage";

export const routes = [
  {
    path: "/login",
    element: <LoginPage />,
    errorElement: <ErrorFallback />,
  },
  {
    element: <ProtectedRoute />,
    errorElement: <ErrorFallback />,
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
        path: "/w/:wId/pods/:podId",
        element: <PodMainPage />,
      },
      {
        path: "/w/:wId/conversation/:cId",
        element: <MainPage />,
      },
      {
        path: "*",
        element: <MainPage />,
      },
    ],
  },
];
