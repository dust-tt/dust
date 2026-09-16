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
 * @cc [owner:rfrenoy,label:react;performance] single-owner-for-sidebar-nav-children
 * `AssistantLayout` MUST be the only component that passes `AgentSidebarMenu` to
 * `useSetNavChildren`, and it MUST be rendered above the route outlet of every agent surface it
 * covers (conversations, Pods, get-started, agent and skill management, labs) rather than by
 * those routes' page components.
 *
 * A single owner above the outlet guarantees that clearing `navChildren` on unmount and setting
 * it again on mount always happen in the same commit, so the value is never committed as
 * `undefined` and the sidebar element is reconciled in place instead of being torn down. Page
 * components cannot provide that guarantee: they are code-split, so switching sections unmounts
 * the old page — clearing `navChildren` — and the next page's mount effect does not run until
 * its chunk resolves. `AgentSidebarMenu` is then unmounted for the length of that fetch, blanking
 * the sidebar, refetching its conversations and Pods, and dropping its scroll and
 * collapsed-section state.
 *
 * This contract is about ownership, not mount stability: it holds even when `AssistantLayout`
 * itself remounts, precisely because the clear and the set stay paired within one commit. In
 * practice it no longer remounts on a `contentWidth` or `hasTitle` change, because
 * `AppContentLayout` renders the outlet at a fixed position in the React tree.
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
