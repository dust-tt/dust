import { useSendNotification } from "@dust-tt/sparkle";
import type { LightWorkspaceType, MentionType } from "@dust-tt/types";
import { ConversationViewer } from "@extension/components/conversation/ConversationViewer";
import { ReachedLimitPopup } from "@extension/components/conversation/ReachedLimitPopup";
import { AssistantInputBar } from "@extension/components/input_bar/InputBar";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import { useSubmitFunction } from "@extension/components/utils/useSubmitFunction";
import { postConversation, postMessage } from "@extension/lib/conversation";
import type { StoredUser } from "@extension/lib/storage";
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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

  const { animate, setAnimate } = useContext(InputBarContext);
  const sendNotification = useSendNotification();

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
    const result = await postMessage({
      owner,
      conversationId: activeConversationId,
      messageData,
    });

    if (result.isErr()) {
      if (result.error.type === "plan_limit_reached_error") {
        setPlanLimitReached(true);
      } else {
        sendNotification({
          title: result.error.title,
          description: result.error.message,
          type: "error",
        });
      }
    } else {
      // TODO (Ext): Handle the message being posted.
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

  return (
    <>
      {activeConversationId && (
        <ConversationViewer
          conversationId={activeConversationId}
          owner={owner}
          user={user}
        />
      )}
      <AssistantInputBar
        owner={owner}
        onSubmit={
          activeConversationId ? handlePostMessage : handlePostConversation
        }
        stickyMentions={[]} //TODO(Ext) do we need this.
      />
      <ReachedLimitPopup
        isOpened={planLimitReached}
        onClose={() => setPlanLimitReached(false)}
        isTrialing={false} // TODO(Ext): Properly handle this from loading the subscription.
      />
    </>
  );
}
