import { Outlet } from "react-router-dom";

import { SpaceLayout } from "@dust-tt/front/components/spaces/SpaceLayout";

export function SpaceLayoutWrapper() {
  return (
    <SpaceLayout>
      <Outlet />
    </SpaceLayout>
  );
}
