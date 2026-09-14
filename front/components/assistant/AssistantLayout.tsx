import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { MemberDetails } from "@app/components/assistant/details/MemberDetails";
import { useSetNavChildren } from "@app/components/sparkle/AppLayoutContext";
import { useURLSheet } from "@app/hooks/useURLSheet";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import type React from "react";
import { useMemo } from "react";

interface AssistantLayoutProps {
  children: React.ReactNode;
  owner: LightWorkspaceType;
  user: AuthContextValue["user"];
}

/**
 * @cc [owner:rfrenoy,label:react;performance] sidebar-owned-by-layout-route
 * `AssistantLayout` MUST be mounted by a router layout route that stays mounted across every
 * agent surface it covers (conversations, Pods, get-started, agent and skill management, labs),
 * and MUST NOT be rendered by the page components of those routes.
 *
 * Pages are code-split: when a page owns the sidebar, switching sections unmounts the old page
 * (clearing `navChildren`) before the next page's chunk resolves, so `AgentSidebarMenu` is torn
 * down and rebuilt on every navigation — blanking the sidebar, refetching its conversations and
 * Pods, and dropping its scroll and collapsed-section state.
 *
 * Consequently, no other component may pass `AgentSidebarMenu` to `useSetNavChildren`.
 */
export function AssistantLayout({
  children,
  owner,
  user,
}: AssistantLayoutProps) {
  const router = useAppRouter();
  const { onOpenChange: onOpenChangeAgentModal } = useURLSheet("agentDetails");
  const { onOpenChange: onOpenChangeUserModal } = useURLSheet("userDetails");

  const agentId = useMemo(() => {
    const sid = router.query.agentDetails ?? [];
    return isString(sid) ? sid : null;
  }, [router.query.agentDetails]);

  const userId = useMemo(() => {
    const sid = router.query.userDetails ?? [];
    return isString(sid) ? sid : null;
  }, [router.query.userDetails]);

  const navChildren = useMemo(
    () => <AgentSidebarMenu owner={owner} />,
    [owner]
  );
  useSetNavChildren(navChildren);

  return (
    <>
      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={agentId}
        onClose={() => onOpenChangeAgentModal(false)}
      />
      <MemberDetails
        owner={owner}
        userId={userId}
        onClose={() => onOpenChangeUserModal(false)}
      />
      {children}
    </>
  );
}
