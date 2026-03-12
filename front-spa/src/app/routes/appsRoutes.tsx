import { DustAppRouterLayout } from "@spa/app/layouts/DustAppRouterLayout";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";

const AppSettingsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/AppSettingsPage"),
  "AppSettingsPage"
);
const AppSpecificationPage = withSuspense(
  () =>
    import("@dust-tt/front/components/pages/spaces/apps/AppSpecificationPage"),
  "AppSpecificationPage"
);
const AppViewPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/AppViewPage"),
  "AppViewPage"
);
const DatasetPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/DatasetPage"),
  "DatasetPage"
);
const DatasetsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/DatasetsPage"),
  "DatasetsPage"
);
const NewDatasetPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/NewDatasetPage"),
  "NewDatasetPage"
);
const RunPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/RunPage"),
  "RunPage"
);
const RunsPage = withSuspense(
  () => import("@dust-tt/front/components/pages/spaces/apps/RunsPage"),
  "RunsPage"
);

export const appsRoutes: RouteObject[] = [
  {
    path: "spaces/:spaceId/apps/:aId",
    element: <DustAppRouterLayout />,
    children: [
      { index: true, element: <AppViewPage /> },
      { path: "settings", element: <AppSettingsPage /> },
      {
        path: "specification",
        element: <AppSpecificationPage />,
      },
      { path: "datasets", element: <DatasetsPage /> },
      { path: "datasets/new", element: <NewDatasetPage /> },
      { path: "datasets/:name", element: <DatasetPage /> },
      { path: "runs", element: <RunsPage /> },
      { path: "runs/:runId", element: <RunPage /> },
    ],
  },
];
