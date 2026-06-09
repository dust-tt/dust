import { AdminLayout } from "@dust-tt/front/components/layouts/AdminLayout";
import { useHasPermission } from "@dust-tt/front/lib/auth/AuthContext";
import Custom404 from "@dust-tt/front/pages/404";
import type { Permission } from "@dust-tt/front/types/permissions";
import { Outlet } from "react-router-dom";

interface RequirePermissionProps {
  permission: Permission;
}

export function RequirePermissionLayout({
  permission,
}: RequirePermissionProps) {
  const hasPermission = useHasPermission();

  if (!hasPermission(permission)) {
    return <Custom404 />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
