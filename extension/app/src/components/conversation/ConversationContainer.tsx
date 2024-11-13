import type {
  AgentMentionType,
  LightWorkspaceType,
  UploadedContentFragmentType,
} from "@dust-tt/client";
import { Page, useSendNotification } from "@dust-tt/sparkle";
import { ConversationViewer } from "@extension/components/conversation/ConversationViewer";
import { ReachedLimitPopup } from "@extension/components/conversation/ReachedLimitPopup";
import { usePublicConversation } from "@extension/components/conversation/usePublicConversation";
import { DropzoneContainer } from "@extension/components/DropzoneContainer";
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
import type { StoredUser } from "@extension/lib/storage";
import {
  getConversationContext,
  setConversationsContext,
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
    void setConversationsContext({
      [activeConversationId ?? "new"]: {
        includeCurrentPage: includeContent,
      },
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
  const [stickyMentions, setStickyMentions] = useState<AgentMentionType[]>([]);
  const dustAPI = useDustAPI();

  const { animate, setAnimate } = useContext(InputBarContext);
  const sendNotification = useSendNotification();

  const { conversation, mutateConversation } = usePublicConversation({
    conversationId,
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

  const handlePostMessage = async (
    input: string,
    mentions: AgentMentionType[],
    contentFragments: UploadedContentFragmentType[]
  ) => {
    if (!activeConversationId) {
      return null;
    }
    const messageData = { input, mentions, contentFragments: [] };
    try {
      await mutateConversation(
        async (currentConversation) => {
          const result = await postMessage({
            dustAPI,
            conversationId: activeConversationId,
            messageData,
            contentFragments,
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
      async (
        input: string,
        mentions: AgentMentionType[],
        contentFragments: UploadedContentFragmentType[]
      ) => {
        const conversationRes = await postConversation({
          dustAPI,
          messageData: {
            input,
            mentions,
          },
          contentFragments,
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
          await setConversationsContext({
            [conversationRes.value.sId]: {
              includeCurrentPage: !!includeContent,
            },
            new: { includeCurrentPage: false },
          });
          setActiveConversationId(conversationRes.value.sId);
        }
      },
      [owner, sendNotification, setActiveConversationId, includeContent]
    )
  );

  const onStickyMentionsChange = useCallback(
    (mentions: AgentMentionType[]) => {
      setStickyMentions(mentions);
    },
    [setStickyMentions]
  );

  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

  return (
    <DropzoneContainer
      description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
      title="Attach files to the conversation"
    >
      {activeConversationId && (
        <ConversationViewer
          conversationId={activeConversationId}
          owner={owner}
          user={user}
          onStickyMentionsChange={onStickyMentionsChange}
        />
      )}
      <div className="sticky bottom-0 z-20 flex flex-col max-h-screen w-full max-w-4xl pb-4">
        {!activeConversationId && (
          <div className="pb-2">
            <Page.Header title={greeting} />
            <Page.SectionHeader title="Start a conversation" />
          </div>
        )}
        <AssistantInputBar
          owner={owner}
          onSubmit={
            activeConversationId ? handlePostMessage : handlePostConversation
          }
          stickyMentions={stickyMentions}
          isTabIncluded={!!includeContent}
          toggleIncludeTab={() => setIncludeContent((v) => !v)}
          conversation={conversation ?? undefined}
        />
      </div>
      <ReachedLimitPopup
        isOpened={planLimitReached}
        onClose={() => setPlanLimitReached(false)}
        isTrialing={false} // TODO(Ext): Properly handle this from loading the subscription.
      />
    </DropzoneContainer>
  );
}
