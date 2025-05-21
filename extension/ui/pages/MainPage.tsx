import type { ProtectedRouteChildrenProps } from "@app/ui/components/auth/ProtectedRoute";
import { ActionValidationProvider } from "@app/ui/components/conversation/ActionValidationProvider";
import { ConversationContainer } from "@app/ui/components/conversation/ConversationContainer";
import { ConversationsListButton } from "@app/ui/components/conversation/ConversationsListButton";
import { FileDropProvider } from "@app/ui/components/conversation/FileUploaderContext";
import { usePublicConversation } from "@app/ui/components/conversation/usePublicConversation";
import { DropzoneContainer } from "@app/ui/components/DropzoneContainer";
import { InputBarProvider } from "@app/ui/components/input_bar/InputBarContext";
import { UserDropdownMenu } from "@app/ui/components/navigation/UserDropdownMenu";
import {
  BarHeader,
  Button,
  ChevronLeftIcon,
  ExternalLinkIcon,
} from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

export const MainPage = ({
  user,
  workspace,
  handleLogout,
}: ProtectedRouteChildrenProps) => {
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
    usePublicConversation({
      conversationId: conversationId ?? null,
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
                <div className="flex flex-row items-right">
                  <ConversationsListButton size="sm" />
                  <Button
                    icon={ExternalLinkIcon}
                    variant="ghost"
                    href={`${user.dustDomain}/w/${workspace.sId}/assistant/${conversationId}`}
                    target="_blank"
                    size="sm"
                    tooltip="Open in Dust"
                  />
                </div>
              ) : (
                <div className="flex flex-row items-right space-x-1">
                  <ConversationsListButton size="sm" />
                  <UserDropdownMenu user={user} handleLogout={handleLogout} />
                </div>
              )
            }
          />
          {!conversationId && (
            <div className="flex items-start justify-between">
              <div className="fixed bottom-0 right-0 z-10 p-2 text-sm element">
                <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                  {shortcut}
                </p>
              </div>
            </div>
          )}
          <div className="h-full w-full pt-28">
            <InputBarProvider>
              <ConversationContainer
                owner={workspace}
                conversationId={conversationId ?? null}
                user={user}
              />
            </InputBarProvider>
          </div>
        </DropzoneContainer>
      </ActionValidationProvider>
    </FileDropProvider>
  );
};
