import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { MemberDetails } from "@app/components/assistant/details/MemberDetails";
import { useSetNavChildren } from "@app/components/sparkle/AppLayoutContext";
import { useURLSheet } from "@app/hooks/useURLSheet";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import type React from "react";
import { useMemo } from "react";

interface AssistantLayoutProps {
  children: React.ReactNode;
  owner: LightWorkspaceType;
  user: AuthContextValue["user"];
  conversation?: ConversationListItemType;
}

/**
 * Shared layout for any surface where the user interacts with agents
 * (conversation pages, pod pages). Provides the sidebar nav, the URL-driven
 * agent / member detail sheets, and the BlockedActionsProvider that the
 * input bar depends on.
 */
export function AssistantLayout({
  children,
  owner,
  user,
  conversation,
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
    <BlockedActionsProvider owner={owner} conversation={conversation}>
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
    </BlockedActionsProvider>
  );
}
