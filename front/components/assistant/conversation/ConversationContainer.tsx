import { Page } from "@dust-tt/sparkle";
import type {
  AgentMention,
  LightAgentConfigurationType,
  MentionType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { UploadedContentFragment } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
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
import {
  createConversationWithMessage,
  createPlaceholderUserMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { updateMessagePagesWithOptimisticData } from "@app/lib/client/conversation/event_handlers";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useConversationMessages } from "@app/lib/swr";

interface ConversationContainerProps {
  conversationId: string | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
  agentIdToMention: string | null;
}

export function ConversationContainer({
  conversationId,
  owner,
  subscription,
  user,
  agentIdToMention,
}: ConversationContainerProps) {
  const [activeConversationId, setActiveConversationId] =
    useState(conversationId);
  const [planLimitReached, setPlanLimitReached] = useState(false);
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);

  const { animate, setAnimate, setSelectedAssistant } =
    useContext(InputBarContext);

  const assistantToMention = useRef<LightAgentConfigurationType | null>(null);

  const router = useRouter();

  const sendNotification = useContext(SendNotificationsContext);

  const { mutateMessages } = useConversationMessages({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
    limit: 50,
  });

  const setInputbarMention = useCallback(
    (agentId: string) => {
      setSelectedAssistant({ configurationId: agentId });
      setAnimate(true);
    },
    [setAnimate, setSelectedAssistant]
  );

  useEffect(() => {
    if (agentIdToMention) {
      setInputbarMention(agentIdToMention);
    }
  }, [agentIdToMention, setInputbarMention]);

  useEffect(() => {
    if (animate) {
      setTimeout(() => setAnimate(false), 500);
    }
  });

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragments: UploadedContentFragment[]
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
    <DropzoneContainer
      description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
      title="Attach files to the conversation"
    >
      <Transition
        show={!!activeConversationId}
        as={Fragment}
        enter="transition-all duration-300 ease-out"
        enterFrom="flex-none w-full h-0"
        enterTo="flex flex-1 w-full"
        leave="transition-all duration-0 ease-out"
        leaveFrom="flex flex-1 w-full"
        leaveTo="flex-none w-full h-0"
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
          <div></div>
        )}
      </Transition>

      <Transition
        as={Fragment}
        show={!activeConversationId}
        enter="transition-opacity duration-100 ease-out"
        enterFrom="opacity-0 min-h-[20vh]"
        enterTo="opacity-100"
        leave="transition-opacity duration-100 ease-out"
        leaveFrom="opacity-100"
        leaveTo="opacity-0 min-h-[20vh]"
      >
        <div
          id="assistant-input-header"
          className="mb-2 flex h-fit min-h-[20vh] w-full max-w-4xl flex-col justify-end px-4 py-2"
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

      <Transition
        show={!activeConversationId}
        enter="transition-opacity duration-100 ease-out"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-100 ease-out"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        className={"flex w-full justify-center"}
      >
        <AssistantBrowserContainer
          onAgentConfigurationClick={setInputbarMention}
          setAssistantToMention={(assistant) => {
            assistantToMention.current = assistant;
          }}
          owner={owner}
        />
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
    </DropzoneContainer>
  );
}
