import { AdminLayout } from "@dust-tt/front/components/layouts/AdminLayout";
import AccessDeniedPage from "@dust-tt/front/components/pages/AccessDeniedPage";
import { useWorkspacePermissions } from "@dust-tt/front/lib/swr/permissions.js";
import type {
  ConcreteResourceType,
  GrantVerb,
} from "@dust-tt/front/types/group_permissions";
import { Outlet } from "react-router-dom";

interface RequirePermissionLayoutProps {
  verb: GrantVerb;
  resourceType: ConcreteResourceType;
}

export function RequirePermissionLayout({
  verb,
  resourceType,
}: RequirePermissionLayoutProps) {
  const { hasPermission } = useWorkspacePermissions();

  const hasRequiredPermission = hasPermission(verb, resourceType);

  if (!hasRequiredPermission) {
    return <AccessDeniedPage />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
