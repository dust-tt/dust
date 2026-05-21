import { PodLayout } from "@dust-tt/front/components/pages/pod/PodLayout";
import { useAuth, useWorkspace } from "@dust-tt/front/lib/auth/AuthContext";
import { Outlet } from "react-router-dom";

/**
 * Router layout that provides PodLayout for SPA pod routes.
 * Gets auth context from AppAuthContextLayout and passes it to PodLayout.
 */
export function PodRouterLayout() {
  const owner = useWorkspace();
  const { user } = useAuth();

  return (
    <PodLayout owner={owner} user={user}>
      <Outlet />
    </PodLayout>
  );
}
