import { Outlet } from "react-router-dom";

import { SpaceLayout } from "@dust-tt/front/components/spaces/SpaceLayout";

/**
 * Wrapper component that provides SpaceLayout for SPA space routes.
 * Uses Outlet to render nested route children.
 * The shell persists across navigation between space pages.
 */
export function SpaceLayoutWrapper() {
  return (
    <SpaceLayout>
      <Outlet />
    </SpaceLayout>
  );
}
