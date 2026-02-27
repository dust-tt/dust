import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { useMemo } from "react";

interface ConversationContainerProps {
  workspace: LightWorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
  conversationId: string | null;
  conversation?: ConversationWithoutContentType;
  serverId?: string;
}

export const ConversationContainer = ({
  workspace,
  user,
  subscription,
  conversationId,
  conversation,
  serverId,
}: ConversationContainerProps) => {
  const { currentPanel } = useConversationSidePanelContext();
  const clientSideMCPServerIds = useMemo(
    () => (serverId ? [serverId] : undefined),
    [serverId]
  );
  return (
    <>
      <div className={currentPanel ? "hidden" : "flex flex-col h-full w-full"}>
        <ConversationContainerVirtuoso
          owner={workspace}
          user={user}
          subscription={subscription}
          conversationId={conversationId}
          clientSideMCPServerIds={clientSideMCPServerIds}
        />
      </div>
      {conversation && (
        <ConversationSidePanelContent
          owner={workspace}
          conversation={conversation}
          currentPanel={currentPanel}
        />
      )}
    </>
  );
};
