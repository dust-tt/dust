import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";

const GetStartedPage = withSuspense(
  () => import("@dust-tt/front/components/pages/workspace/GetStartedPage"),
  "GetStartedPage"
);

export const getStartedRoutes: RouteObject[] = [
  {
    path: "get-started",
    element: <GetStartedPage />,
  },
];
