import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import Custom404 from "@dust-tt/front/components/pages/Custom404";
import { AgentSurfaceRouterLayout } from "@spa/app/layouts/AgentSurfaceRouterLayout";
import { AppContentRouterLayout } from "@spa/app/layouts/AppContentRouterLayout";
import { RootRouterLayout } from "@spa/app/layouts/RootRouterLayout";
import { UnauthenticatedPage } from "@spa/app/layouts/UnauthenticatedPage";
import { WorkspacePage } from "@spa/app/layouts/WorkspacePage";
import { IndexPage } from "@spa/app/pages/IndexPage";
import { adminFullPageRoutes, adminRoutes } from "@spa/app/routes/adminRoutes";
import { appsRoutes } from "@spa/app/routes/appsRoutes";
import {
  builderAgentSurfaceRoutes,
  builderContentRoutes,
  builderFullPageRoutes,
  builderRedirectRoutes,
} from "@spa/app/routes/builderRoutes";
import {
  conversationRedirectRoutes,
  conversationRoutes,
} from "@spa/app/routes/conversationRoutes";
import {
  loginAuthenticatedRoutes,
  loginUnauthenticatedRoutes,
} from "@spa/app/routes/loginRoutes";
import { onboardingRoutes } from "@spa/app/routes/onboardingRoutes";
import { podsRoutes } from "@spa/app/routes/podsRoutes";
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

/**
 * @cc [owner:sfriquet,label:product] workspace-not-found-under-workspace-page
 * A path under `/w/:wId` that matches no other route MUST render the 404 page nested under
 * `WorkspacePage` and `AppContentRouterLayout`, not the global catch-all, so that it is shown in
 * the user locale with the app navigation.
 */
export const routes: RouteObject[] = [
  {
    element: <RootRouterLayout />,
    errorElement: <GlobalErrorFallback />,
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
              // Surfaces that share the agent sidebar. They hang off a single layout route so
              // the sidebar is mounted once and survives navigation between them.
              {
                element: <AgentSurfaceRouterLayout />,
                children: [
                  ...conversationRoutes,
                  ...podsRoutes,
                  ...builderAgentSurfaceRoutes,
                ],
              },
              ...adminRoutes,
              ...spacesRoutes,
              ...appsRoutes,
              ...builderContentRoutes,
              ...spacesRedirectRoutes,
              { path: "*", element: <Custom404 /> },
            ],
          },

          // Routes WITHOUT AppContentLayout (no sidebar/navigation chrome)
          ...adminFullPageRoutes,
          ...builderFullPageRoutes,
          ...builderRedirectRoutes,
          ...conversationRedirectRoutes,
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
