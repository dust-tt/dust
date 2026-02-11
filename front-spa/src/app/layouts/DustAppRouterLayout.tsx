import { DustAppPageLayout } from "@dust-tt/front/components/apps/DustAppPageLayout";
import { Outlet } from "react-router-dom";

export function DustAppRouterLayout() {
  return (
    <DustAppPageLayout>
      <Outlet />
    </DustAppPageLayout>
  );
}
