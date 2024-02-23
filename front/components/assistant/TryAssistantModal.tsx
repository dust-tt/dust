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
import {
  AssistantInputBar,
  FixedAssistantInputBar,
} from "@app/components/assistant/conversation/input_bar/InputBar";
import {
  CONVERSATION_PARENT_SCROLL_DIV_ID as CONVERSATION_PARENT_SCROLL_DIV_ID,
  createConversationWithMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { submitForm } from "@app/components/assistant_builder/AssistantBuilder";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useUser } from "@app/lib/swr";

export function TryAssistant({
  owner,
  openWithConversation,
  builderState,
  focused,
}: {
  owner: WorkspaceType;
  openWithConversation?: ConversationType;
  builderState: AssistantBuilderState;
  focused: boolean;
}) {
  const [conversation, setConversation] = useState<ConversationType | null>(
    openWithConversation ?? null
  );
  const sendNotification = useContext(SendNotificationsContext);
  const { user } = useUser();
  const [assistant, setAssistant] =
    useState<LightAgentConfigurationType | null>(null);
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([
    { configurationId: assistant?.sId as string },
  ]);

  useEffect(() => {
    if (focused) {
      console.log("submitting form");
      submitForm({
        owner,
        builderState: { ...builderState },
        agentConfigurationId: null,
        slackData: {
          selectedSlackChannels: [],
          slackChannelsLinkedWithAgent: [],
        },
        isDraft: true,
      })
        .then((a) => setAssistant(a))
        .catch((e) => console.error(e));
    }
  }, [builderState, owner, focused]);

  useEffect(() => {
    setStickyMentions([{ configurationId: assistant?.sId as string }]);
  }, [assistant]);

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragment?: {
      title: string;
      content: string;
    }
  ) => {
    if (!assistant || !user) return;
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
  if (!user || !assistant) return null;
  return (
    <div className="h-full w-full flex-col justify-between">
      <div className="relative h-full w-full">
        <GenerationContextProvider>
          {conversation && (
            <div
              className="max-h-[100%] overflow-scroll "
              id={CONVERSATION_PARENT_SCROLL_DIV_ID.modal}
            >
              <Conversation
                owner={owner}
                user={user}
                conversationId={conversation.sId}
                onStickyMentionsChange={setStickyMentions}
                isInModal
              />
            </div>
          )}

          <div className="absolute bottom-4 w-full">
            <div className="">
              <AssistantInputBar
                owner={owner}
                onSubmit={handleSubmit}
                stickyMentions={stickyMentions}
                conversationId={conversation?.sId || null}
                tryModalAgentConfiguration={assistant}
              />
            </div>
          </div>
        </GenerationContextProvider>
      </div>
    </div>
  );
}

export function TryAssistantModal({
  owner,
  user,
  title,
  assistant,
  openWithConversation,
  onClose,
}: {
  owner: WorkspaceType;
  user: UserType;
  title?: string;
  openWithConversation?: ConversationType;
  assistant: LightAgentConfigurationType;
  onClose: () => void;
}) {
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([
    { configurationId: assistant?.sId as string },
  ]);
  const [conversation, setConversation] = useState<ConversationType | null>(
    openWithConversation ?? null
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
      title={title ?? `Trying @${assistant?.name}`}
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
              tryModalAgentConfiguration={assistant}
            />
          </div>
        </GenerationContextProvider>
      </div>
    </Modal>
  );
}
