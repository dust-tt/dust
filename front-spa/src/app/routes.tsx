import Custom404 from "@dust-tt/front/pages/404";
import { AppContentRouterLayout } from "@spa/app/layouts/AppContentRouterLayout";
import { RootRouterLayout } from "@spa/app/layouts/RootRouterLayout";
import { UnauthenticatedPage } from "@spa/app/layouts/UnauthenticatedPage";
import { WorkspacePage } from "@spa/app/layouts/WorkspacePage";
import { IndexPage } from "@spa/app/pages/IndexPage";
import { adminRoutes } from "@spa/app/routes/adminRoutes";
import { appsRoutes } from "@spa/app/routes/appsRoutes";
import {
  builderContentRoutes,
  builderFullPageRoutes,
  builderRedirectRoutes,
} from "@spa/app/routes/builderRoutes";
import { conversationRoutes } from "@spa/app/routes/conversationRoutes";
import { labsRoutes } from "@spa/app/routes/labsRoutes";
import {
  loginAuthenticatedRoutes,
  loginUnauthenticatedRoutes,
} from "@spa/app/routes/loginRoutes";
import { onboardingRoutes } from "@spa/app/routes/onboardingRoutes";
import {
  spacesRedirectRoutes,
  spacesRoutes,
} from "@spa/app/routes/spacesRoutes";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";
import { useLocation } from "react-router-dom";

const MaintenancePage = withSuspense(
  () => import("@dust-tt/front/components/pages/MaintenancePage"),
  "MaintenancePage"
);

// Redirect /poke/* to the poke app (poke.dust.tt)
function PokeRedirect() {
  const location = useLocation();
  const pokePath = location.pathname.replace(/^\/poke/, "");
  const pokeOrigin = window.location.origin.replace("://app.", "://poke.");
  window.location.replace(
    `${pokeOrigin}${pokePath}${location.search}${location.hash}`
  );
  return null;
}

export const routes: RouteObject[] = [
  {
    element: <RootRouterLayout />,
    children: [
      { path: "/", element: <IndexPage /> },
      {
        path: "/w/:wId",
        element: <WorkspacePage />,
        children: [
          // Routes WITH shared AppContentLayout (navigation, sidebar, title bar)
          {
            element: <AppContentRouterLayout />,
            children: [
              ...conversationRoutes,
              ...adminRoutes,
              ...labsRoutes,
              ...spacesRoutes,
              ...appsRoutes,
              ...builderContentRoutes,
              ...spacesRedirectRoutes,
            ],
          },

          // Routes WITHOUT AppContentLayout (no sidebar/navigation chrome)
          ...builderFullPageRoutes,
          ...builderRedirectRoutes,
          ...onboardingRoutes,
        ],
      },
      // Login (authenticated routes + logout)
      ...loginAuthenticatedRoutes,
      // Redirect /poke/* to the poke app (e.g., poke.dust.tt)
      { path: "/poke/*", element: <PokeRedirect /> },
      // Login (unauthenticated routes)
      ...loginUnauthenticatedRoutes,
      // Global catch-all routes
      {
        element: <UnauthenticatedPage />,
        children: [
          { path: "/maintenance", element: <MaintenancePage /> },
          { path: "*", element: <Custom404 /> },
        ],
      },
    ],
  },
];
