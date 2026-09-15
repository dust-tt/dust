import { AssistantLayout } from "@dust-tt/front/components/assistant/AssistantLayout";
import { useAuth, useWorkspace } from "@dust-tt/front/lib/auth/AuthContext";
import { Outlet } from "react-router-dom";

/**
 * Router layout shared by every surface that shows the agent sidebar: conversations, Pods,
 * get-started, labs, and the agent / skill management pages.
 *
 * It renders `AssistantLayout` above the outlet so a single owner sets the sidebar for all of
 * them, which keeps `AgentSidebarMenu` alive across navigation between these routes. Pages below
 * must not render `AssistantLayout` themselves — see the
 * `single-owner-for-sidebar-nav-children` contract.
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
