import { Modal } from "@dust-tt/sparkle";
import type {
  AgentMention,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  UserType,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
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
import { submitAssistantBuilderForm } from "@app/components/assistant_builder/AssistantBuilder";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useUser } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { debounce } from "@app/lib/utils/debounce";

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
  const {
    conversation,
    setConversation,
    stickyMentions,
    setStickyMentions,
    handleSubmit,
  } = useTryAssistantCore({
    owner,
    user,
    assistant,
    openWithConversation,
  });

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
            <ConversationViewer
              owner={owner}
              user={user}
              conversationId={conversation.sId}
              onStickyMentionsChange={setStickyMentions}
              isInModal
              key={conversation.sId}
            />
          )}

          <div className="lg:[&>*]:left-0">
            <FixedAssistantInputBar
              owner={owner}
              onSubmit={handleSubmit}
              stickyMentions={stickyMentions}
              conversationId={conversation?.sId || null}
              additionalAgentConfiguration={assistant}
              hideQuickActions
            />
          </div>
        </GenerationContextProvider>
      </div>
    </Modal>
  );
}

export function TryAssistant({
  owner,
  assistant,
  conversationFading,
}: {
  owner: WorkspaceType;
  conversationFading?: boolean;
  assistant: LightAgentConfigurationType | null;
}) {
  const { user } = useUser();
  const {
    conversation,
    setConversation,
    stickyMentions,
    setStickyMentions,
    handleSubmit,
  } = useTryAssistantCore({
    owner,
    user,
    assistant,
  });

  useEffect(() => {
    setConversation(null);
  }, [assistant?.sId, setConversation]);

  if (!user || !assistant) return null;

  return (
    <div
      className={classNames(
        "flex h-full w-full flex-1 flex-col justify-between"
      )}
    >
      <div className="relative h-full w-full">
        <GenerationContextProvider>
          {conversation && (
            <div
              className="max-h-[100%] overflow-y-auto overflow-x-hidden"
              id={CONVERSATION_PARENT_SCROLL_DIV_ID.modal}
            >
              <ConversationViewer
                owner={owner}
                user={user}
                conversationId={conversation.sId}
                onStickyMentionsChange={setStickyMentions}
                isInModal
                hideReactions
                isFading={conversationFading}
                key={conversation.sId}
              />
            </div>
          )}

          <div className="absolute bottom-0 w-full">
            <AssistantInputBar
              owner={owner}
              onSubmit={handleSubmit}
              stickyMentions={stickyMentions}
              conversationId={conversation?.sId || null}
              additionalAgentConfiguration={assistant}
              hideQuickActions
              disableAutoFocus
              isFloating={false}
            />
          </div>
        </GenerationContextProvider>
      </div>
    </div>
  );
}

export function usePreviewAssistant({
  owner,
  builderState,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
}): {
  shouldAnimate: boolean;
  isFading: boolean; // Add isFading to the return type
  draftAssistant: LightAgentConfigurationType | null;
} {
  const animationLength = 1000;
  const [draftAssistant, setDraftAssistant] =
    useState<LightAgentConfigurationType | null>();
  const [animateDrawer, setAnimateDrawer] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const drawerAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);

  const animate = () => {
    if (drawerAnimationTimeoutRef.current) {
      clearTimeout(drawerAnimationTimeoutRef.current);
      drawerAnimationTimeoutRef.current = null;
    }
    setAnimateDrawer(true);
    setIsFading(true); // Start fading conversation
    drawerAnimationTimeoutRef.current = setTimeout(() => {
      setAnimateDrawer(false);
      setIsFading(false); // Stop fading
    }, animationLength);
  };

  const submit = useCallback(async () => {
    const a = await submitAssistantBuilderForm({
      owner,
      builderState: {
        actionMode: builderState.actionMode,
        handle: builderState.handle,
        description: "Draft Assistant",
        instructions: builderState.instructions,
        avatarUrl: builderState.avatarUrl,
        timeFrame: {
          value: builderState.timeFrame.value,
          unit: builderState.timeFrame.unit,
        },
        dustAppConfiguration: builderState.dustAppConfiguration,
        tablesQueryConfiguration: builderState.tablesQueryConfiguration,
        scope: "private",
        dataSourceConfigurations: builderState.dataSourceConfigurations,
        generationSettings: builderState.generationSettings,
      },

      agentConfigurationId: null,
      slackData: {
        selectedSlackChannels: [],
        slackChannelsLinkedWithAgent: [],
      },
      isDraft: true,
    });

    animate();

    // Use setTimeout to delay the execution of setDraftAssistant by 500 milliseconds
    setTimeout(() => {
      setDraftAssistant(a);
    }, animationLength / 2);
  }, [
    owner,
    builderState.actionMode,
    builderState.handle,
    builderState.instructions,
    builderState.avatarUrl,
    builderState.timeFrame.value,
    builderState.timeFrame.unit,
    builderState.dustAppConfiguration,
    builderState.tablesQueryConfiguration,
    builderState.dataSourceConfigurations,
    builderState.generationSettings,
  ]);

  useEffect(() => {
    debounce(debounceHandle, submit, 1500);
  }, [submit]);

  return {
    shouldAnimate: animateDrawer,
    isFading,
    draftAssistant: draftAssistant ?? null,
  };
}

function useTryAssistantCore({
  owner,
  user,
  assistant,
  openWithConversation,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  openWithConversation?: ConversationType;
  assistant: LightAgentConfigurationType | null;
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
    if (!user) return;
    const messageData = { input, mentions, contentFragment };
    if (!conversation) {
      const result = await createConversationWithMessage({
        owner,
        user,
        messageData,
        visibility: "test",
        title: `Trying @${assistant?.name}`,
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

  return {
    stickyMentions,
    setStickyMentions,
    conversation,
    setConversation,
    handleSubmit,
  };
}
