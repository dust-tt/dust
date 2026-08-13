import { AdminLayout } from "@dust-tt/front/components/layouts/AdminLayout";
import Custom404 from "@dust-tt/front/components/pages/Custom404";
import { useAuth } from "@dust-tt/front/lib/auth/AuthContext";
import {
  isAdmin,
  isManager,
  isUser,
  type RoleType,
  type WorkspaceType,
} from "@dust-tt/front/types/user";
import { Outlet } from "react-router-dom";

const ROLE_PREDICATES = {
  admin: isAdmin,
  manager: isManager,
  user: isUser,
} as const satisfies Partial<
  Record<RoleType, (workspace: WorkspaceType | null) => boolean>
>;

interface RequireRoleProps {
  requiredRole: keyof typeof ROLE_PREDICATES;
}

export function RequireRoleLayout({ requiredRole }: RequireRoleProps) {
  const { workspace } = useAuth();

  if (!ROLE_PREDICATES[requiredRole](workspace)) {
    return <Custom404 />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
