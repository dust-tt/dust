import { Page } from "@dust-tt/sparkle";
import type {
  AgentMessageWithRankType,
  LightAgentConfigurationType,
  UserMessageWithRankType,
  UserType,
} from "@dust-tt/types";
import type { AgentMention, MentionType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { cloneDeep } from "lodash";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import React from "react";

import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import ConversationLayout from "@app/components/assistant/conversation/ConversationLayout";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
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
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useConversationMessages } from "@app/lib/swr";
import { AssistantBrowserContainer } from "@app/pages/w/[wId]/assistant/AssistantBrowerContainer";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<
  ConversationLayoutProps & {
    // Here, override conversationId.
    conversationId: string | null;
    user: UserType;
  }
>(async (context, auth) => {
  const owner = auth.workspace();
  const user = auth.user();
  const subscription = auth.subscription();

  if (!owner || !user || !auth.isUser() || !subscription) {
    const { cId } = context.query;

    if (typeof cId === "string") {
      return {
        redirect: {
          destination: `/w/${context.query.wId}/join?cId=${context.query.cId}`,
          permanent: false,
        },
      };
    }

    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  // TODO: We are missing some here.
  const { cId } = context.params;

  return {
    props: {
      user,
      owner,
      subscription,
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
      conversationId: typeof cId === "string" && cId !== "new" ? cId : null,
    },
  };
});

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

export default function AssistantConversation({
  conversationId: initialConversationId,
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [planLimitReached, setPlanLimitReached] = useState(false);
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);

  const sendNotification = useContext(SendNotificationsContext);

  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(initialConversationId);

  const { animate, setAnimate, setSelectedAssistant } =
    useContext(InputBarContext);

  console.log(">> currentConversationId:", currentConversationId);

  // TODO: This creates two extra re-rendering!!!
  useEffect(() => {
    const { cId } = router.query;
    const conversationId =
      typeof cId === "string" && cId !== "new" ? cId : null;

    if (conversationId !== currentConversationId) {
      console.log(
        ">> updating current conversation id:",
        conversationId,
        currentConversationId
      );
      setCurrentConversationId(conversationId);
    }
  }, [router.query, setCurrentConversationId, currentConversationId]);

  const { mutateMessages } = useConversationMessages({
    conversationId: currentConversationId,
    workspaceId: owner.sId,
    limit: 50,
  });

  // useEffect(() => {
  //   function handleNewConvoShortcut(event: KeyboardEvent) {
  //     // Check for Command on Mac or Ctrl on others
  //     const isModifier = event.metaKey || event.ctrlKey;
  //     if (isModifier && event.key === "/") {
  //       void router.push(`/w/${owner.sId}/assistant/new`);
  //     }
  //   }

  //   window.addEventListener("keydown", handleNewConvoShortcut);
  //   return () => {
  //     window.removeEventListener("keydown", handleNewConvoShortcut);
  //   };
  // }, [owner.sId, router]);

  const isNewConversation = !currentConversationId;

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragments: ContentFragmentInput[]
  ) => {
    if (isNewConversation) {
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
            conversationId: currentConversationId,
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
        contentFragments: ContentFragmentInput[]
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
        // TODO: We need some optimistic ui!!!
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
          // TODO: We should probably use state here!
          setCurrentConversationId(conversationRes.value.sId);
          void router.push(
            `/w/${owner.sId}/assistant/${conversationRes.value.sId}`,
            undefined,
            { shallow: true }
          );
        }
      },
      [owner, user, sendNotification, setCurrentConversationId, router]
    )
  );

  useEffect(() => {
    if (animate) {
      setTimeout(() => setAnimate(false), 500);
    }
  });

  const assistantToMention = useRef<LightAgentConfigurationType | null>(null);

  const setInputbarMention = useCallback(
    (agent: LightAgentConfigurationType) => {
      setSelectedAssistant({
        configurationId: agent.sId,
      });
      setAnimate(true);
    },
    [setSelectedAssistant, setAnimate]
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

  useEffect(() => {
    console.log(">> currentConversationId has Changed!!");
  }, [currentConversationId]);

  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

  const onStickyMentionsChange = useCallback(
    (mentions: AgentMention[]) => {
      console.log(">> mentionssssss:", mentions);
      setStickyMentions(mentions);
    },
    [setStickyMentions]
  );

  const previousCallbackRef = useRef<any>();
  useEffect(() => {
    if (previousCallbackRef.current !== onStickyMentionsChange) {
      console.log("onStickyMentionsChange was recreated");
    }
    previousCallbackRef.current = onStickyMentionsChange;
  }, [onStickyMentionsChange]);

  useEffect(() => {
    console.log(">> onStickyMentionsChange changed (1)");
  }, [onStickyMentionsChange]);

  return (
    <>
      {/* // TODO: Do not display when loading existing conversation. */}
      <Transition
        show={!!currentConversationId}
        as={Fragment}
        enter="transition-all duration-500 ease-out" // Removed opacity and transform transitions
        enterFrom="flex-none w-full h-0"
        enterTo="flex flex-1 w-full"
        leave="transition-all duration-0 ease-out" // Removed opacity and transform transitions
        leaveFrom="flex flex-1 w-full"
        leaveTo="flex-none w-full h-0"
      >
        {/* // TODO: Fix css classes */}
        {currentConversationId ? (
          <ConversationViewer
            owner={owner}
            user={user}
            conversationId={currentConversationId}
            // TODO: Fix rendering loop with sticky mentions!
            onStickyMentionsChange={onStickyMentionsChange}
            key={currentConversationId}
          />
        ) : (
          <div></div>
        )}
      </Transition>
      <Transition
        show={!currentConversationId}
        enter="transition-opacity duration-100 ease-out"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-100 ease-out"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div
          id="assistant-input-header"
          className="mb-2 flex h-fit w-full flex-col justify-between px-4 py-2"
        >
          <Page.SectionHeader title={greeting} />
          <Page.SectionHeader title="Start a conversation" />
        </div>
      </Transition>
      <FixedAssistantInputBar
        owner={owner}
        onSubmit={isNewConversation ? handleMessageSubmit : handleSubmit}
        stickyMentions={stickyMentions}
        conversationId={currentConversationId}
      />
      <Transition
        show={!currentConversationId}
        enter="transition-opacity duration-100 ease-out"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-100 ease-out"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <AssistantBrowserContainer
          onAgentConfigurationClick={
            setInputbarMention
            // setStickyMentions((prevMentions) => {
            //   console.log(">> prevMentions:", prevMentions);
            //   // TODO: Make distinct
            //   prevMentions.push({ configurationId: agent.sId });

            //   console.log(">> newMentions:", agent);

            //   return prevMentions;
            // })
          }
          setAssistantToMention={(assistant) =>
            (assistantToMention.current = assistant)
          }
          owner={owner}
        />
      </Transition>

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

AssistantConversation.getLayout = (page: ReactElement, pageProps: any) => {
  return <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>;
};
