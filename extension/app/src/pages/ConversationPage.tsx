import {
  BarHeader,
  Button,
  ChevronLeftIcon,
  ExternalLinkIcon,
} from "@dust-tt/sparkle";
import type { ProtectedRouteChildrenProps } from "@extension/components/auth/ProtectedRoute";
import { ConversationContainer } from "@extension/components/conversation/ConversationContainer";
import { ConversationsListButton } from "@extension/components/conversation/ConversationsListButton";
import { FileDropProvider } from "@extension/components/conversation/FileUploaderContext";
import { usePublicConversation } from "@extension/components/conversation/usePublicConversation";
import { DropzoneContainer } from "@extension/components/DropzoneContainer";
import { InputBarProvider } from "@extension/components/input_bar/InputBarContext";
import { useNavigate, useParams } from "react-router-dom";

export const ConversationPage = ({
  workspace,
  user,
}: ProtectedRouteChildrenProps) => {
  const navigate = useNavigate();
  const { conversationId } = useParams();

  const { conversation, isConversationLoading, conversationError } =
    usePublicConversation({
      conversationId: conversationId ?? null,
    });

  // @ts-expect-error conversationError has a type
  if (!conversationId || conversationError?.type === "conversation_not_found") {
    navigate("/");
    return;
  }

  const title = isConversationLoading
    ? "..."
    : conversation?.title || "Conversation";

  return (
    <FileDropProvider>
      <DropzoneContainer
        description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
        title="Attach files to the conversation"
      >
        <BarHeader
          title={title}
          tooltip={title}
          leftActions={
            <Button
              icon={ChevronLeftIcon}
              variant="ghost"
              onClick={() => {
                navigate("/");
              }}
              size="sm"
            />
          }
          rightActions={
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
          }
        />
        <div className="h-full w-full pt-3 mt-16">
          <InputBarProvider>
            <ConversationContainer
              owner={workspace}
              conversationId={conversationId}
              user={user}
            />
          </InputBarProvider>
        </div>
      </DropzoneContainer>
    </FileDropProvider>
  );
};
