import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";

// Temporary routes for previewing in-progress components against mock data.
// Remove entries once the components they preview are wired for real.
const UsageFilterPanelPreviewPage = withSuspense(
  () =>
    import(
      "@dust-tt/front/components/pages/workspace/UsageFilterPanelPreviewPage"
    ),
  "UsageFilterPanelPreviewPage"
);

export const previewRoutes: RouteObject[] = [
  {
    path: "preview/usage-filter-panel",
    element: <UsageFilterPanelPreviewPage />,
  },
];
