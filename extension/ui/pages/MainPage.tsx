import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import { NoOpConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useConversation } from "@app/hooks/conversations/useConversation";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  BarHeader,
  Button,
  ChevronLeftIcon,
  ExternalLinkIcon,
} from "@dust-tt/sparkle";
import type { ProtectedRouteChildrenProps } from "@extension/ui/components/auth/ProtectedRoute";
import { ActionValidationProvider } from "@extension/ui/components/conversation/ActionValidationProvider";
import { ConversationsListButton } from "@extension/ui/components/conversation/ConversationsListButton";
import { FileDropProvider } from "@extension/ui/components/conversation/FileUploaderContext";
import { DropzoneContainer } from "@extension/ui/components/DropzoneContainer";
import { UserDropdownMenu } from "@extension/ui/components/navigation/UserDropdownMenu";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

export const MainPage = ({
  user,
  workspace,
  handleLogout,
}: ProtectedRouteChildrenProps) => {
  const { subscription } = useAuth();
  const isMac = /macintosh|mac os x/i.test(navigator.userAgent);
  const shortcut = isMac ? "⇧⌘E" : "⇧+Ctrl+E";

  const navigate = useNavigate();

  // Parse conversation ID from catch-all path
  const params = useParams();
  const conversationId = useMemo(() => {
    if (!params["*"]) {
      return null;
    }
    const match = params["*"].match(/conversations\/([^/]+)/);
    return match ? match[1] : null;
  }, [params]);

  const { conversation, isConversationLoading, conversationError } =
    useConversation({
      conversationId: conversationId,
      workspaceId: workspace.sId,
    });

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
          <BarHeader
            title={headerTitle}
            tooltip={headerTitle}
            leftActions={
              conversationId && (
                <Button
                  icon={ChevronLeftIcon}
                  variant="ghost"
                  onClick={() => {
                    navigate("/");
                  }}
                  size="sm"
                />
              )
            }
            rightActions={
              conversationId ? (
                <div className="items-right flex flex-row">
                  <ConversationsListButton size="sm" />
                  <Button
                    icon={ExternalLinkIcon}
                    variant="ghost"
                    href={`${user.dustDomain}/w/${workspace.sId}/agent/${conversationId}`}
                    target="_blank"
                    size="sm"
                    tooltip="Open in Dust"
                  />
                </div>
              ) : (
                <div className="items-right flex flex-row space-x-1">
                  <ConversationsListButton size="sm" />
                  <UserDropdownMenu user={user} handleLogout={handleLogout} />
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
                  <InputBarProvider>
                    <ConversationContainerVirtuoso
                      owner={workspace}
                      user={user}
                      subscription={subscription}
                      conversationId={conversationId}
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
