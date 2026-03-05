import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { useConversation } from "@app/hooks/conversations/useConversation";
import { useSetupNotifications } from "@app/hooks/useSetupNotifications";
import { useAuth } from "@app/lib/auth/AuthContext";
import { Button, MoreIcon } from "@dust-tt/sparkle";
import { useMcpServer } from "@extension/shared/hooks/useMcpServer";
import { ConversationLayout } from "@extension/ui/components/conversation/ConversationLayout";
import { UserDropdownMenu } from "@extension/ui/components/navigation/UserDropdownMenu";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { ConversationContainer } from "../components/conversation/ConversationContainer";

export const MainPage = () => {
  const { user, workspace, subscription } = useAuth();
  const { serverId } = useMcpServer();
  useSetupNotifications();
  const isMac = /macintosh|mac os x/i.test(navigator.userAgent);
  const shortcut = isMac ? "⇧⌘E" : "⇧+Ctrl+E";

  // Parse conversation ID from catch-all path
  const params = useParams();
  const conversationId = useMemo(() => {
    if (!params["*"]) {
      return null;
    }
    const match = params["*"].match(/conversation\/([^/]+)/);
    const isNewConversation = match && match[1] === "new";
    const isSpaceConversation = match && match[1] === "space";
    if (isNewConversation || isSpaceConversation) {
      return null;
    }
    return match ? match[1] : null;
  }, [params]);

  const { conversation, isConversationLoading, conversationError } =
    useConversation({
      conversationId: conversationId,
      workspaceId: workspace.sId,
    });

  const { isMenuOpen, menuTriggerPosition, handleMenuOpenChange } =
    useConversationMenu();

  const headerTitle = useMemo(() => {
    if (!conversationId) {
      return "";
    }
    if (isConversationLoading) {
      return "...";
    }
    if (conversationError) {
      return "Error loading conversation";
    }
    return conversation?.title || "Conversation";
  }, [conversation, isConversationLoading, conversationId, conversationError]);

  return (
    <ConversationLayout
      title={headerTitle}
      rightActions={
        conversationId ? (
          <ConversationMenu
            activeConversationId={conversationId}
            conversation={conversation}
            owner={workspace}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                icon={MoreIcon}
                aria-label="Conversation menu"
              />
            }
            isConversationDisplayed={true}
            isOpen={isMenuOpen}
            onOpenChange={handleMenuOpenChange}
            triggerPosition={menuTriggerPosition}
            displayOpenInBrowser
            openDetailsInNewTab
          />
        ) : (
          <div className="items-right flex flex-row space-x-1">
            <UserDropdownMenu />
          </div>
        )
      }
    >
      {!conversationId && (
        <div className="element fixed bottom-0 right-0 z-10 p-2 text-sm">
          <p className="text-muted-foreground dark:text-muted-foreground-night text-sm font-normal">
            {shortcut}
          </p>
        </div>
      )}
      <BlockedActionsProvider owner={workspace} conversation={conversation}>
        <ConversationSidePanelProvider>
          <GenerationContextProvider>
            <ConversationContainer
              workspace={workspace}
              user={user}
              subscription={subscription}
              conversationId={conversationId}
              conversation={conversation}
              serverId={serverId}
            />
          </GenerationContextProvider>
        </ConversationSidePanelProvider>
      </BlockedActionsProvider>
    </ConversationLayout>
  );
};
