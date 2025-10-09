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
import ConversationViewerVirtuoso from "@app/components/assistant/conversation/ConversationViewerVirtuoso";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { useSendNotification } from "@app/hooks/useNotification";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import type { DustError } from "@app/lib/error";
import {
  useConversationMessages,
  useConversations,
} from "@app/lib/swr/conversations";
import { getAgentRoute } from "@app/lib/utils/router";
import type {
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
}

export function ConversationContainerVirtuoso({
  owner,
  subscription,
  user,
}: ConversationContainerProps) {
  const { activeConversationId } = useConversationsNavigation();

  const [planLimitReached, setPlanLimitReached] = useState(false);

  const { setSelectedAssistant } = useContext(InputBarContext);

  const { hasBlockedActions, totalBlockedActions, showBlockedActionsDialog } =
    useActionValidationContext();

  const assistantToMention = useRef<LightAgentConfigurationType | null>(null);

  const router = useRouter();

  const sendNotification = useSendNotification();

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: {
      disabled: true, // We don't need to fetch conversations here.
    },
  });

  const { isMessagesError } = useConversationMessages({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
    limit: 50,
  });

  const { serverId } = useCoEditionContext();

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
        await router.push(
          getAgentRoute(
            owner.sId,
            conversationRes.value.sId,
            "justCreated=true"
          ),
          undefined,
          { shallow: true }
        );

        await mutateConversations(
          (currentData) => {
            // Immediately update the list of conversations in the sidebar by adding the new conversation.
            return {
              ...currentData,
              conversations: [
                ...(currentData?.conversations ?? []),
                conversationRes.value,
              ],
            };
          },
          { revalidate: false }
        );

        return new Ok(undefined);
      }
    },
    [
      isSubmitting,
      mutateConversations,
      owner,
      router,
      sendNotification,
      serverId,
      user,
    ]
  );

  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

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

  const body = (
    <DropzoneContainer
      description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
      title="Attach files to the conversation"
    >
      {activeConversationId ? (
        <>
          <ConversationViewerVirtuoso
            owner={owner}
            user={user}
            conversationId={activeConversationId}
            setPlanLimitReached={setPlanLimitReached}
          />
          {hasBlockedActions && (
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
        </>
      ) : (
        <>
          <div
            id="assistant-input-header"
            className="flex h-fit min-h-[20vh] w-full max-w-3xl flex-col justify-end gap-8 py-4"
            ref={startConversationRef}
          >
            <Page.Header title={greeting} />
          </div>
          <FixedAssistantInputBar
            owner={owner}
            onSubmit={handleConversationCreation}
            conversationId={null}
            disable={false}
          />
          <AgentBrowserContainer
            onAgentConfigurationClick={(agentId) => {
              setSelectedAssistant({ configurationId: agentId });
            }}
            setAssistantToMention={(assistant) => {
              assistantToMention.current = assistant;
            }}
            owner={owner}
            user={user}
          />
        </>
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

  // we wrap the body in a div to avoid a bug with the virtuoso scrolling
  // when there is no active conversation
  return activeConversationId ? (
    body
  ) : (
    <div className="h-full overflow-auto px-4 py-4 md:px-8">{body}</div>
  );
}
