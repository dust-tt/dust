import { Page } from "@dust-tt/sparkle";
import type {
  AgentMention,
  AgentMessageWithRankType,
  LightAgentConfigurationType,
  MentionType,
  SubscriptionType,
  UserMessageWithRankType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { UploadedContentFragment } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { cloneDeep } from "lodash";
import { useRouter } from "next/router";
import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { AssistantBrowserContainer } from "@app/components/assistant/conversation/AssistantBrowserContainer";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { HelpAndQuickGuideWrapper } from "@app/components/assistant/conversation/HelpAndQuickGuideWrapper";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { ContentFragmentInput } from "@app/components/assistant/conversation/lib";
import {
  createConversationWithMessage,
  createPlaceholderUserMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import type { FetchConversationMessagesResponse } from "@app/lib/api/assistant/messages";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useConversationMessages } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

interface ConversationContainerProps {
  conversationId: string | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
}

export function ConversationContainer({
  conversationId,
  owner,
  subscription,
  user,
}: ConversationContainerProps) {
  const [activeConversationId, setActiveConversationId] =
    useState(conversationId);
  const [planLimitReached, setPlanLimitReached] = useState(false);
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);

  const { animate, setAnimate } = useContext(InputBarContext);

  const assistantToMention = useRef<LightAgentConfigurationType | null>(null);

  const router = useRouter();

  const sendNotification = useContext(SendNotificationsContext);

  const { mutateMessages } = useConversationMessages({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
    limit: 50,
  });

  useEffect(() => {
    if (animate) {
      setTimeout(() => setAnimate(false), 500);
    }
  });

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragments: ContentFragmentInput[]
  ) => {
    if (!activeConversationId) {
      return null;
    }

    const messageData = { input, mentions, contentFragments };

    try {
      // Update the local state immediately and fire the
      // request. Since the API will return the updated
      // data, there is no need to start a new revalidation
      // and we can directly populate the cache.
      await mutateMessages(
        async (currentMessagePages) => {
          const result = await submitMessage({
            owner,
            user,
            conversationId: activeConversationId,
            messageData,
          });

          // Replace placeholder message with API response.
          if (result.isOk()) {
            const { message } = result.value;

            return updateMessagePagesWithOptimisticData(
              currentMessagePages,
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
          // Add optimistic data placeholder.
          optimisticData: (currentMessagePages) => {
            const lastMessageRank =
              currentMessagePages?.at(0)?.messages.at(-1)?.rank ?? 0;

            const placeholderMessage = createPlaceholderUserMessage({
              input,
              mentions,
              user,
              lastMessageRank,
            });
            return updateMessagePagesWithOptimisticData(
              currentMessagePages,
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

  const { submit: handleMessageSubmit } = useSubmitFunction(
    useCallback(
      async (
        input: string,
        mentions: MentionType[],
        contentFragments: UploadedContentFragment[]
      ) => {
        const conversationRes = await createConversationWithMessage({
          owner,
          user,
          messageData: {
            input,
            mentions,
            contentFragments,
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
          // We start the push before creating the message to optimize for instantaneity as well.
          setActiveConversationId(conversationRes.value.sId);
          void router.push(
            `/w/${owner.sId}/assistant/${conversationRes.value.sId}`,
            undefined,
            { shallow: true }
          );
        }
      },
      [owner, user, sendNotification, setActiveConversationId, router]
    )
  );

  const setInputbarMention = useCallback(
    (agent: LightAgentConfigurationType) => {
      setStickyMentions((prev) => {
        const alreadyInStickyMention = prev.find(
          (m) => m.configurationId === agent.sId
        );

        if (alreadyInStickyMention) {
          return prev;
        }

        return [...prev, { configurationId: agent.sId }];
      });
      setAnimate(true);
    },
    [setStickyMentions, setAnimate]
  );

  useEffect(() => {
    const scrollContainerElement = document.getElementById(
      "assistant-input-header"
    );

    if (scrollContainerElement) {
      const observer = new IntersectionObserver(
        () => {
          if (assistantToMention.current) {
            setInputbarMention(assistantToMention.current);
            assistantToMention.current = null;
          }
        },
        { threshold: 0.8 }
      );
      observer.observe(scrollContainerElement);
    }
  }, [setAnimate, setInputbarMention]);

  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

  const onStickyMentionsChange = useCallback(
    (mentions: AgentMention[]) => {
      setStickyMentions(mentions);
    },
    [setStickyMentions]
  );

  return (
    <>
      <Transition show={!!activeConversationId} as="div" appear={true}>
        {activeConversationId ? (
          <div
            className={classNames(
              "h-full w-full max-w-4xl transition-all ease-out",
              "data-[enter]:duration-300",
              "data-[enter]:data-[closed]:h-0 data-[enter]:data-[closed]:w-full data-[enter]:data-[closed]:flex-none",
              "data-[enter]:data-[open]:flex data-[enter]:data-[open]:w-full data-[enter]:data-[open]:flex-1",
              "data-[leave]:duration-300",
              "data-[leave]:data-[open]:flex data-[leave]:data-[open]:w-full data-[leave]:data-[open]:flex-1",
              "data-[leave]:data-[closed]:h-0 data-[leave]:data-[closed]:w-full data-[leave]:data-[closed]:flex-none"
            )}
          >
            <ConversationViewer
              owner={owner}
              user={user}
              conversationId={activeConversationId}
              // TODO(2024-06-20 flav): Fix extra-rendering loop with sticky mentions.
              onStickyMentionsChange={onStickyMentionsChange}
            />
          </div>
        ) : (
          <div></div>
        )}
      </Transition>

      <Transition show={!activeConversationId}>
        <div
          className={classNames(
            "mb-2 flex h-fit min-h-[20vh] w-full max-w-4xl flex-col justify-end px-4 py-2",
            "transition-opacity ease-out",
            "data-[enter]:duration-100",
            "data-[enter]:data-[closed]:min-h-[20vh] data-[enter]:data-[closed]:opacity-0",
            "data-[enter]:data-[open]:opacity-100",
            "data-[leave]:duration-100",
            "data-[leave]:data-[open]:opacity-100",
            "data-[leave]:data-[closed]:min-h-[20vh] data-[leave]:data-[closed]:opacity-0"
          )}
          id="assistant-input-header"
        >
          <Page.SectionHeader title={greeting} />
          <Page.SectionHeader title="Start a conversation" />
        </div>
      </Transition>

      <FixedAssistantInputBar
        owner={owner}
        onSubmit={activeConversationId ? handleSubmit : handleMessageSubmit}
        stickyMentions={stickyMentions}
        conversationId={activeConversationId}
      />

      <Transition as={Fragment} show={!activeConversationId}>
        <div
          className={classNames(
            "flex w-full justify-center",
            "transition-opacity ease-out",
            "data-[enter]:duration-100",
            "data-[enter]:data-[closed]:opacity-0",
            "data-[enter]:data-[open]:opacity-100",
            "data-[leave]:duration-100",
            "data-[leave]:data-[open]:opacity-100",
            "data-[leave]:data-[closed]:opacity-0"
          )}
        >
          <AssistantBrowserContainer
            onAgentConfigurationClick={setInputbarMention}
            setAssistantToMention={(assistant) => {
              assistantToMention.current = assistant;
            }}
            owner={owner}
          />
        </div>
      </Transition>

      {activeConversationId !== "new" && (
        <HelpAndQuickGuideWrapper owner={owner} user={user} />
      )}

      <ReachedLimitPopup
        isOpened={planLimitReached}
        onClose={() => setPlanLimitReached(false)}
        subscription={subscription}
        owner={owner}
        code="message_limit"
      />
    </>
  );
}

/**
 * If no message pages exist, create a single page with the optimistic message.
 * If message pages exist, add the optimistic message to the first page, since
 * the message pages array is not yet reversed.
 */
export function updateMessagePagesWithOptimisticData(
  currentMessagePages: FetchConversationMessagesResponse[] | undefined,
  messageOrPlaceholder: AgentMessageWithRankType | UserMessageWithRankType
): FetchConversationMessagesResponse[] {
  if (!currentMessagePages || currentMessagePages.length === 0) {
    return [
      {
        messages: [messageOrPlaceholder],
        hasMore: false,
        lastValue: null,
      },
    ];
  }

  // We need to deep clone here, since SWR relies on the reference.
  const updatedMessages = cloneDeep(currentMessagePages);
  updatedMessages.at(0)?.messages.push(messageOrPlaceholder);

  return updatedMessages;
}
