import {
  Button,
  CloudArrowDownIcon,
  HistoryIcon,
  Page,
  Tooltip,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  AgentMention,
  LightWorkspaceType,
  MentionType,
} from "@dust-tt/types";
import { ConversationViewer } from "@extension/components/conversation/ConversationViewer";
import { ReachedLimitPopup } from "@extension/components/conversation/ReachedLimitPopup";
import { usePublicConversation } from "@extension/components/conversation/usePublicConversation";
import { FixedAssistantInputBar } from "@extension/components/input_bar/InputBar";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import { useSubmitFunction } from "@extension/components/utils/useSubmitFunction";
import {
  createPlaceholderUserMessage,
  postConversation,
  postMessage,
  updateConversationWithOptimisticData,
} from "@extension/lib/conversation";
import { sendGetActiveTabMessage } from "@extension/lib/messages";
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

  const [tabContentToInclude, setTabContentToInclude] = useState<{
    title: string;
    content: string;
    url: string;
  } | null>(null);

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

  const handleIncludeCurrentTab = async () => {
    const backgroundRes = await sendGetActiveTabMessage();
    if (!backgroundRes.content || !backgroundRes.url) {
      console.error("Failed to get content from the current tab.");
      return;
    }
    setTabContentToInclude({
      title: `Content from ${backgroundRes.url}`,
      content: backgroundRes.content,
      url: backgroundRes.url,
    });
  };

  const handlePostMessage = async (input: string, mentions: MentionType[]) => {
    if (!activeConversationId) {
      return null;
    }
    const messageData = { input, mentions, contentFragments: [] };
    try {
      await mutateConversation(
        async (currentConversation) => {
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
        },
        {
          optimisticData: (currentConversation) => {
            const placeholderMessage = createPlaceholderUserMessage({
              input,
              mentions,
              user,
            });
            return updateConversationWithOptimisticData(
              currentConversation,
              placeholderMessage
            );
          },
          revalidate: false,
          // Rollback optimistic update on errors.
          rollbackOnError: true,
          populateCache: true,
        }
      );
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
          tabContent: tabContentToInclude,
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
      [owner, sendNotification, setActiveConversationId, tabContentToInclude]
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
      <div className="flex items-center justify-between pb-2">
        <Page.SectionHeader title={`Hi ${user.firstName},`} />
        <div className="space-x-1">
          {!activeConversationId && (
            <Tooltip
              label={
                tabContentToInclude
                  ? `Page included: ${tabContentToInclude.url}`
                  : "Include content from the current tab"
              }
              trigger={
                <Button
                  icon={CloudArrowDownIcon}
                  variant="outline"
                  onClick={handleIncludeCurrentTab}
                  disabled={tabContentToInclude !== null}
                  size="xs"
                />
              }
            />
          )}
          <Button
            icon={HistoryIcon}
            variant="outline"
            onClick={() => navigate("/conversations")}
            size="xs"
          />
        </div>
      </div>
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
