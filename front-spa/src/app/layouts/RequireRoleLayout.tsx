import { AdminLayout } from "@dust-tt/front/components/layouts/AdminLayout";
import Custom404 from "@dust-tt/front/components/pages/Custom404";
import { useAuth } from "@dust-tt/front/lib/auth/AuthContext";
import {
  isAdmin,
  isBusinessAdmin,
  type RoleType,
} from "@dust-tt/front/types/user.js";
import { Outlet } from "react-router-dom";

interface RequireRoleProps {
  role: Extract<RoleType, "admin" | "business_admin">;
}

export function RequireRoleLayout({ role }: RequireRoleProps) {
  const { workspace } = useAuth();

  const hasRequiredRole =
    role === "admin" ? isAdmin(workspace) : isBusinessAdmin(workspace);

  if (!hasRequiredRole) {
    return <Custom404 />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
