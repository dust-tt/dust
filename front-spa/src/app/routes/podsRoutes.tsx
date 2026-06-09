import { PodRouterLayout } from "@spa/app/layouts/PodRouterLayout";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";
import { Navigate, useLocation, useParams } from "react-router-dom";

const PodPage = withSuspense(
  () => import("@dust-tt/front/components/pages/pod/PodPage"),
  "PodPage"
);

// Redirect legacy /conversation/space/:spaceId URLs
// to the new /pods/:podId path.
function LegacySpaceToPodRedirect() {
  const { spaceId } = useParams();
  const location = useLocation();
  return (
    <Navigate
      to={`../pods/${spaceId}${location.search}${location.hash}`}
      replace
    />
  );
}

export const podsRoutes: RouteObject[] = [
  {
    path: "pods/:podId",
    element: <PodRouterLayout />,
    children: [
      {
        index: true,
        element: <PodPage />,
      },
    ],
  },
  {
    path: "conversation/space/:spaceId",
    element: <LegacySpaceToPodRedirect />,
  },
];
