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
import { InputBarProvider } from "@extension/components/input_bar/InputBarContext";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

export const ConversationPage = ({
  workspace,
  user,
}: ProtectedRouteChildrenProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { conversationId } = useParams();

  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    if (location.state?.origin) {
      setOrigin(location.state.origin);
    }
  }, [location.state?.origin]);

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
            onClick={() => {
              if (origin === "conversations") {
                navigate("/conversations");
              } else {
                navigate("/");
              }
            }}
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
