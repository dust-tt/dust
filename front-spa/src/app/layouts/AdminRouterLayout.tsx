import { AdminLayout } from "@dust-tt/front/components/layouts/AdminLayout";
import { Outlet } from "react-router-dom";

export function AdminRouterLayout() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
