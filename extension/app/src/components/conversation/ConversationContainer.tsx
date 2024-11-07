import {
  Button,
  CloudArrowDownIcon,
  HistoryIcon,
  Page,
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
import { AssistantInputBar } from "@extension/components/input_bar/InputBar";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import { useSubmitFunction } from "@extension/components/utils/useSubmitFunction";
import {
  createPlaceholderUserMessage,
  postConversation,
  postMessage,
  updateConversationWithOptimisticData,
} from "@extension/lib/conversation";
import { useDustAPI } from "@extension/lib/dust_api";
import { getRandomGreetingForName } from "@extension/lib/greetings";
import { sendGetActiveTabMessage } from "@extension/lib/messages";
import type { StoredUser } from "@extension/lib/storage";
import {
  getConversationContext,
  setConversationContext,
} from "@extension/lib/storage";
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

  const [includeContent, setIncludeContent] = useState<boolean | undefined>();

  useEffect(() => {
    if (includeContent === undefined) {
      return;
    }

    void setConversationContext(activeConversationId ?? "new", {
      includeCurrentPage: includeContent,
    });
  }, [includeContent]);

  useEffect(() => {
    const doAsync = async () => {
      const context = await getConversationContext(
        activeConversationId ?? "new"
      );
      setIncludeContent(context.includeCurrentPage);
    };
    void doAsync();
  }, [conversationId]);

  const [planLimitReached, setPlanLimitReached] = useState(false);
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);
  const dustAPI = useDustAPI();

  const { animate, setAnimate } = useContext(InputBarContext);
  const sendNotification = useSendNotification();

  const { conversation, mutateConversation } = usePublicConversation({
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

  const getIncludeCurrentTab = async () => {
    const backgroundRes = await sendGetActiveTabMessage();
    if (!backgroundRes.content || !backgroundRes.url) {
      console.error("Failed to get content from the current tab.");
      return null;
    }
    return {
      title: backgroundRes.title,
      content: backgroundRes.content,
      url: backgroundRes.url,
    };
  };

  const handlePostMessage = async (input: string, mentions: MentionType[]) => {
    if (!activeConversationId) {
      return null;
    }
    const messageData = { input, mentions, contentFragments: [] };
    try {
      await mutateConversation(
        async (currentConversation) => {
          const tabContent = includeContent
            ? await getIncludeCurrentTab()
            : null;
          // Check if the content is already uploaded - compare the title and the size of the content.
          const alreadyUploaded =
            tabContent &&
            conversation?.content
              .map((m) => m[m.length - 1])
              .some(
                (m) =>
                  m.type === "content_fragment" &&
                  m.title === tabContent.title &&
                  m.textBytes === new Blob([tabContent.content]).size
              );

          const result = await postMessage({
            dustAPI,
            conversationId: activeConversationId,
            messageData,
            tabContent: alreadyUploaded ? null : tabContent,
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
        const tabContent = includeContent ? await getIncludeCurrentTab() : null;
        const conversationRes = await postConversation({
          dustAPI,
          messageData: {
            input,
            mentions,
          },
          tabContent,
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
          await setConversationContext(conversationRes.value.sId, {
            includeCurrentPage: !!includeContent,
          });
          setActiveConversationId(conversationRes.value.sId);
        }
      },
      [owner, sendNotification, setActiveConversationId, includeContent]
    )
  );

  const onStickyMentionsChange = useCallback(
    (mentions: AgentMention[]) => {
      setStickyMentions(mentions);
    },
    [setStickyMentions]
  );

  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

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
      <div className="sticky bottom-0 z-20 flex flex-col max-h-screen w-full max-w-4xl pb-4">
        {!activeConversationId ? (
          <div className="flex justify-between items-end pb-2">
            <div>
              <Page.Header title={greeting} />
              <Page.SectionHeader title="Start a conversation" />
            </div>
            <div className="flex space-x-1">
              <Button
                label={includeContent ? `Page included` : "Include page"}
                icon={CloudArrowDownIcon}
                variant={includeContent ? "highlight" : "outline"}
                onClick={() => setIncludeContent((v) => !v)}
              />
              <ConversationHistory />
            </div>
          </div>
        ) : (
          <div className="flex justify-end items-end pb-2 gap-1">
            <Button
              label={includeContent ? `Page included` : "Include page"}
              icon={CloudArrowDownIcon}
              variant={includeContent ? "highlight" : "outline"}
              onClick={() => setIncludeContent((v) => !v)}
            />

            <ConversationHistory />
          </div>
        )}
        <AssistantInputBar
          owner={owner}
          onSubmit={
            activeConversationId ? handlePostMessage : handlePostConversation
          }
          stickyMentions={stickyMentions}
        />
      </div>
      <ReachedLimitPopup
        isOpened={planLimitReached}
        onClose={() => setPlanLimitReached(false)}
        isTrialing={false} // TODO(Ext): Properly handle this from loading the subscription.
      />
    </>
  );
}

const ConversationHistory = () => {
  const navigate = useNavigate();
  return (
    <Button
      tooltip="View all conversations"
      icon={HistoryIcon}
      variant="outline"
      onClick={() => navigate("/conversations")}
    />
  );
};
