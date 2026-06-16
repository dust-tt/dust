import { AdminLayout } from "@dust-tt/front/components/layouts/AdminLayout";
import Custom404 from "@dust-tt/front/components/pages/Custom404";
import { useAuth } from "@dust-tt/front/lib/auth/AuthContext";
import {
  hasPermission,
  type Permission,
} from "@dust-tt/front/types/permissions";
import { Outlet } from "react-router-dom";

interface RequirePermissionProps {
  permission: Permission;
}

export function RequirePermissionLayout({
  permission,
}: RequirePermissionProps) {
  const { workspace } = useAuth();

  if (!hasPermission(workspace.role, permission)) {
    return <Custom404 />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
