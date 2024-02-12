import { Modal } from "@dust-tt/sparkle";
import type {
  AgentMention,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  UserType,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { useContext, useEffect, useState } from "react";

import Conversation from "@app/components/assistant/conversation/Conversation";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import {
  CONVERSATION_PARENT_SCROLL_DIV_ID as CONVERSATION_PARENT_SCROLL_DIV_ID,
  createConversationWithMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";

export function TryAssistantModal({
  owner,
  user,
  assistant,
  onClose,
}: {
  owner: WorkspaceType;
  user: UserType;
  assistant: LightAgentConfigurationType;
  onClose: () => void;
}) {
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([
    { configurationId: assistant?.sId as string },
  ]);
  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );
  const sendNotification = useContext(SendNotificationsContext);

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragment?: {
      title: string;
      content: string;
    }
  ) => {
    const messageData = { input, mentions, contentFragment };
    if (!conversation) {
      const result = await createConversationWithMessage({
        owner,
        user,
        messageData,
        visibility: "test",
        title: `Trying @${assistant.name}`,
      });
      if (result.isOk()) {
        setConversation(result.value);
        return;
      }
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });
    } else {
      const result = await submitMessage({
        owner,
        user,
        conversationId: conversation.sId as string,
        messageData,
      });
      if (result.isOk()) return;
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });
    }
  };

  useEffect(() => {
    setStickyMentions([{ configurationId: assistant?.sId as string }]);
  }, [assistant]);

  return (
    <Modal
      isOpen={!!assistant}
      title={`Trying @${assistant?.name}`}
      onClose={async () => {
        onClose();
        if (conversation && "sId" in conversation) {
          setConversation(null);
        }
      }}
      hasChanged={false}
      variant="side-md"
    >
      <div
        id={CONVERSATION_PARENT_SCROLL_DIV_ID.modal}
        className="h-full overflow-y-auto"
      >
        <GenerationContextProvider>
          {conversation && (
            <Conversation
              owner={owner}
              user={user}
              conversationId={conversation.sId}
              onStickyMentionsChange={setStickyMentions}
              isInModal
            />
          )}

          <div className="lg:[&>*]:left-0">
            <FixedAssistantInputBar
              owner={owner}
              onSubmit={handleSubmit}
              stickyMentions={stickyMentions}
              conversationId={conversation?.sId || null}
              additionalAgentConfigurations={[assistant]}
            />
          </div>
        </GenerationContextProvider>
      </div>
    </Modal>
  );
}
