import { SpaceLayout } from "@dust-tt/front/components/spaces/SpaceLayout";
import { Outlet } from "react-router-dom";

export function SpaceLayoutWrapper() {
  return (
    <SpaceLayout>
      <Outlet />
    </SpaceLayout>
  );
}
