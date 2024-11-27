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
import { InputBarProvider } from "@extension/components/input_bar/InputBarContext";
import { useNavigate, useParams } from "react-router-dom";

export const ConversationPage = ({
  workspace,
  user,
}: ProtectedRouteChildrenProps) => {
  const navigate = useNavigate();
  const { conversationId } = useParams();

  const { conversation, isConversationLoading } = usePublicConversation({
    conversationId: conversationId ?? null,
  });

  if (!conversationId) {
    navigate("/");
    return;
  }

  const title = isConversationLoading
    ? "..."
    : conversation?.title || "Conversation";

  return (
    <FileDropProvider>
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
            size="md"
          />
        }
        rightActions={
          <div className="flex flex-row items-right">
            <ConversationsListButton size="md" />

            <Button
              icon={ExternalLinkIcon}
              variant="ghost"
              href={`${process.env.DUST_DOMAIN}/w/${workspace.sId}/assistant/${conversationId}`}
              target="_blank"
              size="md"
              tooltip="Open in Dust"
            />
          </div>
        }
      />
      <div className="h-full w-full pt-4 mt-12">
        <InputBarProvider>
          <ConversationContainer
            owner={workspace}
            conversationId={conversationId}
            user={user}
          />
        </InputBarProvider>
      </div>
    </FileDropProvider>
  );
};
