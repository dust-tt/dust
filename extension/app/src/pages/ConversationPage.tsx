import { BarHeader, Button, ExternalLinkIcon } from "@dust-tt/sparkle";
import type { ProtectedRouteChildrenProps } from "@extension/components/auth/ProtectedRoute";
import { ConversationContainer } from "@extension/components/conversation/ConversationContainer";
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
    workspaceId: workspace.sId,
  });

  if (!conversationId) {
    navigate("/");
    return;
  }

  return (
    <>
      <BarHeader
        title={conversation?.title || "Conversation"}
        rightActions={
          <div className="flex flex-row items-right">
            <Button
              icon={ExternalLinkIcon}
              variant="ghost"
              href={`${process.env.DUST_DOMAIN}/w/${workspace.sId}/assistant/${conversationId}`}
              target="_blank"
            />
            <BarHeader.ButtonBar
              variant="close"
              onClose={() => navigate("/")}
            />
          </div>
        }
      />
      <div className="h-full w-full pt-4">
        <ConversationContainer
          owner={workspace}
          conversationId={conversationId}
          user={user}
        />
      </div>
    </>
  );
};
