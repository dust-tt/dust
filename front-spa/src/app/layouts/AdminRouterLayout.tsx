import { AdminLayout } from "@dust-tt/front/components/layouts/AdminLayout";
import { useAuth } from "@dust-tt/front/lib/auth/AuthContext";
import Custom404 from "@dust-tt/front/pages/404";
import { Outlet } from "react-router-dom";

export function AdminRouterLayout() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <Custom404 />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
