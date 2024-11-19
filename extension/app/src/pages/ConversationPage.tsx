import {
  BarHeader,
  Button,
  ChevronLeftIcon,
  ExternalLinkIcon,
} from "@dust-tt/sparkle";
import type { ProtectedRouteChildrenProps } from "@extension/components/auth/ProtectedRoute";
import { ConversationContainer } from "@extension/components/conversation/ConversationContainer";
import { FileDropProvider } from "@extension/components/conversation/FileUploaderContext";
import { usePublicConversation } from "@extension/components/conversation/usePublicConversation";
import { useNavigate, useParams } from "react-router-dom";

export const ConversationPage = ({
  workspace,
  user,
}: ProtectedRouteChildrenProps) => {
  const navigate = useNavigate();
  const { conversationId } = useParams();

  const { conversation } = usePublicConversation({
    conversationId: conversationId ?? null,
  });

  if (!conversationId) {
    navigate("/");
    return;
  }

  return (
    <FileDropProvider>
      <BarHeader
        title={conversation?.title || "Conversation"}
        tooltip={conversation?.title || "Conversation"}
        leftActions={
          <Button
            icon={ChevronLeftIcon}
            variant="ghost"
            onClick={() => navigate(-1)}
            size="md"
          />
        }
        rightActions={
          <div className="flex flex-row items-right">
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
        <ConversationContainer
          owner={workspace}
          conversationId={conversationId}
          user={user}
        />
      </div>
    </FileDropProvider>
  );
};
