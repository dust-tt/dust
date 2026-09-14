import { AssistantLayout } from "@dust-tt/front/components/assistant/AssistantLayout";
import { useAuth, useWorkspace } from "@dust-tt/front/lib/auth/AuthContext";
import { Outlet } from "react-router-dom";

/**
 * Router layout shared by every surface that shows the agent sidebar: conversations, Pods,
 * get-started, and the agent / skill management pages.
 *
 * It owns `AssistantLayout` so the sidebar is mounted once and survives navigation between those
 * routes. Pages below must not render `AssistantLayout` themselves — see the
 * `sidebar-owned-by-layout-route` contract.
 */
export function AgentSurfaceRouterLayout() {
  const owner = useWorkspace();
  const { user } = useAuth();

  return (
    <AssistantLayout owner={owner} user={user}>
      <Outlet />
    </AssistantLayout>
  );
}
