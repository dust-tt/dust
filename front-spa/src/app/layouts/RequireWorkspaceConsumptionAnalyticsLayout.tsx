import { AdminLayout } from "@dust-tt/front/components/layouts/AdminLayout";
import Custom404 from "@dust-tt/front/components/pages/Custom404";
import { useAuth } from "@dust-tt/front/lib/auth/AuthContext";
import { Outlet } from "react-router-dom";

export function RequireWorkspaceConsumptionAnalyticsLayout() {
  const { canViewWorkspaceConsumptionAnalytics, isManager } = useAuth();

  if (!isManager && !canViewWorkspaceConsumptionAnalytics) {
    return <Custom404 />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
