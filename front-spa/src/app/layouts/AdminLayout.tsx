import { AdminLayout as SharedAdminLayout } from "@dust-tt/front/components/layouts/AdminLayout";
import { Outlet } from "react-router-dom";

export function AdminLayout() {
  return (
    <SharedAdminLayout>
      <Outlet />
    </SharedAdminLayout>
  );
}
