import { RequireFeatureFlagLayout } from "@spa/app/layouts/RequireFeatureFlagLayout";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";

const NewAppPage = withSuspense(
  () => import("@dust-tt/front/components/pages/app/NewAppPage"),
  "NewAppPage"
);
const AppBuilderPage = withSuspense(
  () => import("@dust-tt/front/components/pages/app/AppBuilderPage"),
  "AppBuilderPage"
);

/**
 * The App builder takes over the whole screen, so these sit outside `AppContentRouterLayout`
 * alongside the agent builder's full-page routes. `apps/new` is registered before `apps/:appId` so
 * the param route does not swallow it.
 */
export const appBuilderRoutes: RouteObject[] = [
  {
    element: <RequireFeatureFlagLayout flag="top_level_apps" />,
    children: [
      { path: "apps/new", element: <NewAppPage /> },
      { path: "apps/:appId", element: <AppBuilderPage /> },
    ],
  },
];
