import { AdminSubNavigation } from "@dust-tt/front/components/navigation/AdminSubNavigation";
import Custom404 from "@dust-tt/front/components/pages/Custom404";
import { useAuth } from "@dust-tt/front/lib/auth/AuthContext";
import { isAdmin, isManager, type RoleType } from "@dust-tt/front/types/user";
import { Outlet } from "react-router-dom";

interface RequireRoleProps {
  requiredRole: Extract<RoleType, "admin" | "manager">;
}

export function RequireRoleLayout({ requiredRole }: RequireRoleProps) {
  const { workspace } = useAuth();

  const hasRequiredRole =
    requiredRole === "admin" ? isAdmin(workspace) : isManager(workspace);

  if (!hasRequiredRole) {
    return <Custom404 />;
  }

  return (
    <AdminSubNavigation>
      <Outlet />
    </AdminSubNavigation>
  );
}
