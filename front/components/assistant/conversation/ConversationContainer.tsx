import {
  ContentMessageAction,
  ContentMessageInline,
  InformationCircleIcon,
  Page,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { AgentBrowserContainer } from "@app/components/assistant/conversation/AgentBrowserContainer";
import { useActionValidationContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useCoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import {
  createConversationWithMessage,
  createPlaceholderUserMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { useSendNotification } from "@app/hooks/useNotification";
import { updateMessagePagesWithOptimisticData } from "@app/lib/client/conversation/event_handlers";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import type { DustError } from "@app/lib/error";
import {
  useConversationMessages,
  useConversations,
} from "@app/lib/swr/conversations";
import { getAgentRoute } from "@app/lib/utils/router";
import type {
  AgentMention,
  ContentFragmentsType,
  LightAgentConfigurationType,
  MentionType,
  Result,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { conjugate, Err, Ok, pluralize, removeNulls } from "@app/types";

interface ConversationContainerProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
  agentIdToMention: string | null;
}

export function ConversationContainer({
  owner,
  subscription,
  user,
  agentIdToMention,
}: ConversationContainerProps) {
  const { activeConversationId } = useConversationsNavigation();

  const [planLimitReached, setPlanLimitReached] = useState(false);
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);

  const { animate, setAnimate, setSelectedAssistant } =
    useContext(InputBarContext);

  const { hasBlockedActions, totalBlockedActions, showBlockedActionsDialog } =
    useActionValidationContext();

  const assistantToMention = useRef<LightAgentConfigurationType | null>(null);
  const { scrollConversationsToTop } = useConversationsNavigation();

  const router = useRouter();

  const { execution } = router.query;
  const executionMode = typeof execution === "string" ? execution : "auto";

  const sendNotification = useSendNotification();

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: {
      disabled: true, // We don't need to fetch conversations here.
    },
  });

  const { mutateMessages, isMessagesError } = useConversationMessages({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
    limit: 50,
  });

  const setInputBarMention = useCallback(
    (agentId: string) => {
      setSelectedAssistant({ configurationId: agentId });
      setAnimate(true);
    },
    [setAnimate, setSelectedAssistant]
  );

  useEffect(() => {
    if (agentIdToMention) {
      setInputBarMention(agentIdToMention);
    }
  }, [agentIdToMention, setInputBarMention]);

  useEffect(() => {
    if (animate) {
      setTimeout(() => setAnimate(false), 500);
    }
  });

  const { serverId } = useCoEditionContext();

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragments: ContentFragmentsType
  ): Promise<Result<undefined, DustError>> => {
    if (!activeConversationId) {
      return new Err({
        code: "internal_error",
        name: "NoActiveConversation",
        message: "No active conversation",
      });
    }

    const messageData = {
      input,
      mentions,
      contentFragments,
      clientSideMCPServerIds: removeNulls([serverId]),
    };

    try {
      // Update the local state immediately and fire the request. Since the API will return the
      // updated data, there is no need to start a new revalidation and we can directly populate the
      // cache.
      await mutateMessages(
        async (currentMessagePages) => {
          const result = await submitMessage({
            owner,
            user,
            conversationId: activeConversationId,
            messageData,
            executionMode,
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
      await mutateConversations();
      scrollConversationsToTop();
    } catch (err) {
      // If the API errors, the original data will be rolled back by SWR automatically.
      console.error("Failed to post message:", err);
      return new Err({
        code: "internal_error",
        name: "FailedToPostMessage",
        message: `Failed to post message ${err}`,
      });
    }

    return new Ok(undefined);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConversationCreation = useCallback(
    async (
      input: string,
      mentions: MentionType[],
      contentFragments: ContentFragmentsType,
      selectedMCPServerViewIds?: string[]
    ): Promise<Result<undefined, DustError>> => {
      if (isSubmitting) {
        return new Err({
          code: "internal_error",
          name: "AlreadySubmitting",
          message: "Already submitting",
        });
      }

      setIsSubmitting(true);

      const conversationRes = await createConversationWithMessage({
        owner,
        user,
        messageData: {
          input,
          mentions,
          contentFragments,
          clientSideMCPServerIds: removeNulls([serverId]),
          selectedMCPServerViewIds,
        },
        executionMode,
      });

      setIsSubmitting(false);

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

        return new Err({
          code: "internal_error",
          name: conversationRes.error.title,
          message: conversationRes.error.message,
        });
      } else {
        // We start the push before creating the message to optimize for instantaneity as well.
        // Navigate directly to the canonical route to avoid relying on
        // next.config.js redirects (which can be bypassed with shallow routing).
        await router.push(
          getAgentRoute(owner.sId, conversationRes.value.sId),
          undefined,
          { shallow: true }
        );
        await mutateConversations();
        scrollConversationsToTop();

        return new Ok(undefined);
      }
    },
    [
      executionMode,
      isSubmitting,
      mutateConversations,
      owner,
      router,
      scrollConversationsToTop,
      sendNotification,
      serverId,
      user,
    ]
  );

  useEffect(() => {
    const scrollContainerElement = document.getElementById(
      "assistant-input-header"
    );

    if (scrollContainerElement) {
      const observer = new IntersectionObserver(
        () => {
          if (assistantToMention.current) {
            setInputBarMention(assistantToMention.current.sId);
            assistantToMention.current = null;
          }
        },
        { threshold: 0.8 }
      );
      observer.observe(scrollContainerElement);
    }
    const handleRouteChange = (url: string) => {
      if (url.endsWith("/new")) {
        setSelectedAssistant(null);
        assistantToMention.current = null;
      }
    };
    router.events.on("routeChangeComplete", handleRouteChange);
  }, [setAnimate, setInputBarMention, router, setSelectedAssistant]);

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

  const { startConversationRef } = useWelcomeTourGuide();

  if (isMessagesError) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col gap-3 text-center">
          <div>
            <span className="text-4xl leading-10 text-foreground dark:text-foreground-night">
              🚫
            </span>
            <p className="copy-sm leading-tight text-muted-foreground dark:text-muted-foreground-night">
              You don't have access to this conversation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DropzoneContainer
      description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
      title="Attach files to the conversation"
    >
      {activeConversationId ? (
        <ConversationViewer
          owner={owner}
          user={user}
          conversationId={activeConversationId}
          // TODO(2024-06-20 flav): Fix extra-rendering loop with sticky mentions.
          onStickyMentionsChange={onStickyMentionsChange}
        />
      ) : (
        <div
          id="assistant-input-header"
          className="flex h-fit min-h-[20vh] w-full max-w-3xl flex-col justify-end gap-8 py-4"
          ref={startConversationRef}
        >
          <Page.Header title={greeting} />
        </div>
      )}

      {activeConversationId && hasBlockedActions && (
        <ContentMessageInline
          icon={InformationCircleIcon}
          variant="primary"
          className="max-h-dvh mb-5 flex w-full sm:w-full sm:max-w-3xl"
        >
          <span className="font-bold">
            {totalBlockedActions} action
            {pluralize(totalBlockedActions)}
          </span>{" "}
          require{conjugate(totalBlockedActions)} manual approval
          <ContentMessageAction
            label="Review actions"
            variant="outline"
            size="xs"
            onClick={() => showBlockedActionsDialog()}
          />
        </ContentMessageInline>
      )}

      <FixedAssistantInputBar
        owner={owner}
        onSubmit={
          activeConversationId ? handleSubmit : handleConversationCreation
        }
        stickyMentions={stickyMentions}
        conversationId={activeConversationId}
        disable={activeConversationId !== null && hasBlockedActions}
      />

      {!activeConversationId && (
        <AgentBrowserContainer
          onAgentConfigurationClick={setInputBarMention}
          setAssistantToMention={(assistant) => {
            assistantToMention.current = assistant;
          }}
          owner={owner}
          user={user}
        />
      )}

      <ReachedLimitPopup
        isOpened={planLimitReached}
        onClose={() => setPlanLimitReached(false)}
        subscription={subscription}
        owner={owner}
        code="message_limit"
      />
    </DropzoneContainer>
  );
}
