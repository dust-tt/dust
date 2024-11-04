import { useSendNotification } from "@dust-tt/sparkle";
import type {
  AgentMention,
  AgentMessageWithRankType,
  ConversationType,
  LightWorkspaceType,
  MentionType,
  UserMessageWithRankType,
} from "@dust-tt/types";
import { ConversationViewer } from "@extension/components/conversation/ConversationViewer";
import { ReachedLimitPopup } from "@extension/components/conversation/ReachedLimitPopup";
import { usePublicConversation } from "@extension/components/conversation/usePublicConversation";
import { FixedAssistantInputBar } from "@extension/components/input_bar/InputBar";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import { useSubmitFunction } from "@extension/components/utils/useSubmitFunction";
import { postConversation, postMessage } from "@extension/lib/conversation";
import type { StoredUser } from "@extension/lib/storage";
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export function updateConversationWithOptimisticData(
  currentConversation: { conversation: ConversationType } | undefined,
  messageOrPlaceholder: AgentMessageWithRankType | UserMessageWithRankType
): { conversation: ConversationType } {
  console.log("messageOrPlaceholder", messageOrPlaceholder);
  if (
    !currentConversation?.conversation ||
    currentConversation.conversation.content.length === 0
  ) {
    throw new Error("Conversation not found");
  }

  // const conversation = cloneDeep(currentConversation.conversation);
  // conversation.content.at(0)?.push(messageOrPlaceholder);

  return currentConversation;
}

interface ConversationContainerProps {
  conversationId: string | null;
  owner: LightWorkspaceType;
  user: StoredUser;
}

export function ConversationContainer({
  conversationId,
  owner,
  user,
}: ConversationContainerProps) {
  const navigate = useNavigate();
  const [activeConversationId, setActiveConversationId] =
    useState(conversationId);
  const [planLimitReached, setPlanLimitReached] = useState(false);
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);

  const { animate, setAnimate } = useContext(InputBarContext);
  const sendNotification = useSendNotification();

  const { mutateConversation } = usePublicConversation({
    conversationId,
    workspaceId: owner.sId,
  });

  useEffect(() => {
    if (animate) {
      setTimeout(() => setAnimate(false), 500);
    }
  });

  useEffect(() => {
    if (activeConversationId) {
      navigate(`/conversations/${activeConversationId}`, {
        replace: true,
      });
    }
  }, [activeConversationId, navigate]);

  const handlePostMessage = async (input: string, mentions: MentionType[]) => {
    if (!activeConversationId) {
      return null;
    }
    const messageData = { input, mentions, contentFragments: [] };
    try {
      await mutateConversation(async (currentConversation) => {
        console.log("currentConversation", currentConversation);
        const result = await postMessage({
          owner,
          conversationId: activeConversationId,
          messageData,
        });

        if (result.isOk()) {
          const { message } = result.value;

          return updateConversationWithOptimisticData(
            currentConversation,
            message
          );
        }

        if (result.error.type === "plan_limit_reached_error") {
          setPlanLimitReached(true);
        } else {
          sendNotification({
            title: result.error.title,
            description: result.error.message,
            type: "error",
          });
        }

        throw result.error;
      });
    } catch (err) {
      // If the API errors, the original data will be
      // rolled back by SWR automatically.
      console.error("Failed to post message:", err);
    }
  };

  const { submit: handlePostConversation } = useSubmitFunction(
    useCallback(
      async (input: string, mentions: MentionType[]) => {
        const conversationRes = await postConversation({
          owner,
          messageData: {
            input,
            mentions,
          },
        });
        if (conversationRes.isErr()) {
          if (conversationRes.error.type === "plan_limit_reached_error") {
            setPlanLimitReached(true);
          } else {
            sendNotification({
              title: conversationRes.error.title,
              description: conversationRes.error.message,
              type: "error",
            });
          }
        } else {
          setActiveConversationId(conversationRes.value.sId);
        }
      },
      [owner, sendNotification, setActiveConversationId]
    )
  );

  const onStickyMentionsChange = useCallback(
    (mentions: AgentMention[]) => {
      setStickyMentions(mentions);
    },
    [setStickyMentions]
  );

  return (
    <>
      {activeConversationId && (
        <ConversationViewer
          conversationId={activeConversationId}
          owner={owner}
          user={user}
          onStickyMentionsChange={onStickyMentionsChange}
        />
      )}
      <FixedAssistantInputBar
        owner={owner}
        onSubmit={
          activeConversationId ? handlePostMessage : handlePostConversation
        }
        stickyMentions={stickyMentions}
      />

      <ReachedLimitPopup
        isOpened={planLimitReached}
        onClose={() => setPlanLimitReached(false)}
        isTrialing={false} // TODO(Ext): Properly handle this from loading the subscription.
      />
    </>
  );
}
