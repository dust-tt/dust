import { Modal } from "@dust-tt/sparkle";
import {
  AgentConfigurationType,
  AgentMention,
  ConversationType,
  InternalPostConversationsRequestBodySchema,
  MentionType,
  UserType,
} from "@dust-tt/types";
import { WorkspaceType } from "@dust-tt/types";
import * as t from "io-ts";
import { useContext, useEffect, useState } from "react";

import Conversation from "@app/components/assistant/conversation/Conversation";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { NotificationType } from "@app/components/sparkle/Notification";
import { deleteConversation, submitMessage } from "@app/lib/conversation";
import { PostConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";

export function TryAssistantModal({
  owner,
  user,
  assistant,
  onClose,
}: {
  owner: WorkspaceType;
  user: UserType;
  assistant: AgentConfigurationType;
  onClose: () => void;
}) {
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([
    { configurationId: assistant?.sId as string },
  ]);
  const [conversation, setConversation] = useState<
    ConversationType | null | { errorMessage: string }
  >(null);
  const sendNotification = useContext(SendNotificationsContext);

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragment?: {
      title: string;
      content: string;
    }
  ) => {
    if (!conversation || "errorMessage" in conversation) return;
    const messageData = { input, mentions, contentFragment };
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
  };

  useEffect(() => {
    setStickyMentions([{ configurationId: assistant?.sId as string }]);
    if (assistant && !conversation) {
      createEmptyConversation(owner.sId, assistant, sendNotification)
        .then(async (conv) => {
          await submitMessage({
            owner,
            user,
            conversationId: conv.sId,
            messageData: {
              input: "Hi, I'd like to try you out!",
              mentions: [{ configurationId: assistant.sId }],
            },
          });
          setConversation(conv);
        })
        .catch((e) => setConversation({ errorMessage: e.message }));
    }
  }, [assistant, conversation, owner, sendNotification, user]);

  return (
    <Modal
      isOpen={!!assistant}
      title={`Trying @${assistant?.name}`}
      onClose={async () => {
        onClose();
        if (conversation && "sId" in conversation) {
          await deleteConversation({
            workspaceId: owner.sId,
            conversationId: conversation?.sId as string,
            sendNotification,
          });
          setConversation(null);
        }
      }}
      hasChanged={false}
      variant="side-md"
    >
      {conversation && !("errorMessage" in conversation) && (
        <GenerationContextProvider>
          <Conversation
            owner={owner}
            user={user}
            conversationId={conversation.sId}
            onStickyMentionsChange={setStickyMentions}
          />
          <FixedAssistantInputBar
            owner={owner}
            onSubmit={handleSubmit}
            stickyMentions={stickyMentions}
            conversationId={conversation.sId}
          />{" "}
        </GenerationContextProvider>
      )}
      {conversation && "errorMessage" in conversation && (
        <div className="flex h-full flex-col items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-semibold">
              Error creating conversation
            </h2>
            <p className="text-structure-500 text-lg">
              {conversation.errorMessage}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

async function createEmptyConversation(
  workspaceId: string,
  agentConfiguration: AgentConfigurationType,
  sendNotification: (notification: NotificationType) => void
): Promise<ConversationType> {
  const body: t.TypeOf<typeof InternalPostConversationsRequestBodySchema> = {
    title: `Trying out ${agentConfiguration.name}`,
    visibility: "unlisted",
    message: null,
    contentFragment: undefined,
  };

  const cRes = await fetch(`/api/w/${workspaceId}/assistant/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!cRes.ok) {
    const data = await cRes.json();
    sendNotification({
      title: "Error creating conversation.",
      description: data.error.message || "Please try again or contact us.",
      type: "error",
    });
    throw new Error(data.error.message);
  }

  return ((await cRes.json()) as PostConversationsResponseBody).conversation;
}
