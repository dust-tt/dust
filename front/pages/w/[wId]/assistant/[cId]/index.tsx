import type {
  AgentMessageWithRankType,
  UserMessageWithRankType,
  UserType,
} from "@dust-tt/types";
import type { AgentMention, MentionType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { cloneDeep } from "lodash";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useContext, useEffect, useState } from "react";

import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import ConversationLayout from "@app/components/assistant/conversation/ConversationLayout";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import type { ContentFragmentInput } from "@app/components/assistant/conversation/lib";
import {
  createConversationWithMessage,
  createPlaceholderUserMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import type { FetchConversationMessagesResponse } from "@app/lib/api/assistant/messages";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useConversationMessages } from "@app/lib/swr";

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
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);
  const [planLimitReached, setPlanLimitReached] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  const [isAnimating, setIsAnimating] = useState(true);

  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    const { cId } = router.query;
    const conversationId =
      typeof cId === "string" && cId !== "new" ? cId : null;

    setCurrentConversationId(conversationId);
  }, [router.query, setCurrentConversationId]);

  const { mutateMessages } = useConversationMessages({
    conversationId: currentConversationId,
    workspaceId: owner.sId,
    limit: 50,
  });

  useEffect(() => {
    function handleNewConvoShortcut(event: KeyboardEvent) {
      // Check for Command on Mac or Ctrl on others
      const isModifier = event.metaKey || event.ctrlKey;
      if (isModifier && event.key === "/") {
        void router.push(`/w/${owner.sId}/assistant/new`);
      }
    }

    window.addEventListener("keydown", handleNewConvoShortcut);
    return () => {
      window.removeEventListener("keydown", handleNewConvoShortcut);
    };
  }, [owner.sId, router]);

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

          setIsAnimating(true);
        }
      },
      [owner, user, sendNotification, setCurrentConversationId, router]
    )
  );

  return (
    <>
      {currentConversationId && (
        <ConversationViewer
          owner={owner}
          user={user}
          conversationId={currentConversationId}
          onStickyMentionsChange={setStickyMentions}
          key={currentConversationId}
        />
      )}
      {/* <Transition
        show={isAnimating}
        enter="transition-transform duration-500"
        enterFrom="transform translate-y-full"
        enterTo="transform translate-y-0"
        leave="transition-transform duration-500"
        leaveFrom="transform translate-y-0"
        leaveTo="transform translate-y-full"
        afterEnter={() => setIsAnimating(false)} // Stop animating after entering
      > */}
      <FixedAssistantInputBar
        owner={owner}
        onSubmit={isNewConversation ? handleMessageSubmit : handleSubmit}
        stickyMentions={stickyMentions}
        conversationId={currentConversationId}
      />
      {/* </Transition> */}
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
