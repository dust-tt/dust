import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { NoOpConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useConversation } from "@app/hooks/conversations/useConversation";
import { useSetupNotifications } from "@app/hooks/useSetupNotifications";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  BarHeader,
  Button,
  MenuIcon,
  MoreIcon,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useMcpServer } from "@extension/shared/hooks/useMcpServer";
import { ActionValidationProvider } from "@extension/ui/components/conversation/ActionValidationProvider";
import { FileDropProvider } from "@extension/ui/components/conversation/FileUploaderContext";
import { DropzoneContainer } from "@extension/ui/components/DropzoneContainer";
import { UserDropdownMenu } from "@extension/ui/components/navigation/UserDropdownMenu";
import { useContext, useMemo } from "react";
import { useParams } from "react-router-dom";

export const MainPage = () => {
  const { user, workspace, subscription } = useAuth();
  const { serverId } = useMcpServer();
  useSetupNotifications();
  const isMac = /macintosh|mac os x/i.test(navigator.userAgent);
  const shortcut = isMac ? "⇧⌘E" : "⇧+Ctrl+E";

  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);

  // Parse conversation ID from catch-all path
  const params = useParams();
  const conversationId = useMemo(() => {
    if (!params["*"]) {
      return null;
    }
    const match = params["*"].match(/conversation\/([^/]+)/);
    const isNewConversation = match && match[1] === "new";
    if (isNewConversation) {
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
    <FileDropProvider>
      <ActionValidationProvider>
        <DropzoneContainer
          description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
          title="Attach files to the conversation"
        >
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              side="left"
              className="flex w-full max-w-72 flex-1 bg-muted-background dark:bg-muted-background-night"
            >
              <SheetHeader className="bg-muted-background p-0" hideButton>
                <SheetTitle className="hidden" />
              </SheetHeader>
              <div className="flex flex-col grow p-1">
                <AgentSidebarMenu
                  owner={workspace}
                  hideActions
                  hideInAppBanner
                />
              </div>
            </SheetContent>
          </Sheet>
          <BarHeader
            title={headerTitle}
            tooltip={headerTitle}
            className="justify-between"
            leftActions={
              <Button
                variant="ghost"
                icon={MenuIcon}
                onClick={() => setSidebarOpen(true)}
              />
            }
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
          />
          {!conversationId && (
            <div className="flex items-start justify-between">
              <div className="element fixed bottom-0 right-0 z-10 p-2 text-sm">
                <p className="text-muted-foreground dark:text-muted-foreground-night text-sm font-normal">
                  {shortcut}
                </p>
              </div>
            </div>
          )}
          <div className="h-full w-full pt-28">
            <BlockedActionsProvider
              owner={workspace}
              conversation={conversation}
            >
              <NoOpConversationSidePanelProvider>
                <GenerationContextProvider>
                  <InputBarProvider origin="extension">
                    <ConversationContainerVirtuoso
                      owner={workspace}
                      user={user}
                      subscription={subscription}
                      conversationId={conversationId}
                      clientSideMCPServerIds={serverId ? [serverId] : undefined}
                    />
                  </InputBarProvider>
                </GenerationContextProvider>
              </NoOpConversationSidePanelProvider>
            </BlockedActionsProvider>
          </div>
        </DropzoneContainer>
      </ActionValidationProvider>
    </FileDropProvider>
  );
};
