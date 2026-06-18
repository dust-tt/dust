import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import {
  getWorkspaceLimitForSubmitError,
  ReachedLimitPopup,
} from "@app/components/app/ReachedLimitPopup";
import { AgentBrowserContainer } from "@app/components/assistant/conversation/AgentBrowserContainer";
import { ConversationViewer } from "@app/components/assistant/conversation/ConversationViewer";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { useConversations } from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import type { DustError } from "@app/lib/error";
import { useAppRouter } from "@app/lib/platform";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
import { classNames } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  ConversationListItemType,
  SubmitMessageError,
} from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import {
  toMentionType,
  toRichAgentMentionType,
} from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { SubscriptionType } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { UserType, WorkspaceType } from "@app/types/user";
import { getWorkspaceDefaultAgentId, isAdmin } from "@app/types/user";
import {
  Button,
  Card,
  Lightbulb04,
  Page,
  ScrollArea,
  XClose,
} from "@dust-tt/sparkle";
import { useCallback, useContext, useEffect, useState } from "react";

interface ConversationContainerProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
  conversationId?: string | null;
  clientSideMCPServerIds?: string[];
  suggestion?: {
    id: string;
    title: string;
    description: string;
  };
  onDismissSuggestion?: (suggestionId: string) => void;
}

export function ConversationContainerVirtuoso({
  owner,
  subscription,
  user,
  conversationId: conversationIdProp,
  clientSideMCPServerIds,
  suggestion,
  onDismissSuggestion,
}: ConversationContainerProps) {
  const conversationIdFromRouter = useActiveConversationId();
  const activeConversationId =
    conversationIdProp !== undefined
      ? conversationIdProp
      : conversationIdFromRouter;

  const [limitReachedCode, setLimitReachedCode] =
    useState<WorkspaceLimit | null>(null);
  const { setSelectedSingleAgent } = useContext(InputBarContext);

  const router = useAppRouter();

  const sendNotification = useSendNotification();

  const { hasFeature } = useFeatureFlags();
  const workspaceDefaultAgentId = hasFeature("workspace_default_agent")
    ? getWorkspaceDefaultAgentId(owner)
    : null;

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // A seatless member can never send a message. We surface this up-front rather
  // than relying on the deferred background message-post failure, which lands
  // after navigation and would otherwise leave behind an empty conversation.
  const { userBlockedReason } = useWorkspaceUsageStatus({
    owner,
  });

  // Maps a message-send failure to the right surface: blocking limits (no seat,
  // credits, per-user cap, plan limit) open the dedicated popup, everything else
  // is a transient error shown as a notification.
  const handleSubmitMessageError = useCallback(
    (error: SubmitMessageError) => {
      const limitCode = getWorkspaceLimitForSubmitError(error.type);
      if (limitCode) {
        setLimitReachedCode(limitCode);
      } else {
        sendNotification({
          title: error.title,
          description: error.message,
          type: "error",
        });
      }
    },
    [sendNotification]
  );

  const handleConversationCreation = useCallback(
    async (
      input: string,
      mentions: RichMention[],
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

      // Pre-check blocking conditions before creating the conversation.
      // With deferMessage:true the message posts after navigation, so backend
      // errors arrive too late and leave an empty conversation behind.
      // userBlockedReason comes directly from isUserBlocked on the server —
      // no blocking logic lives here.
      if (userBlockedReason) {
        let limitCode: WorkspaceLimit;
        switch (userBlockedReason) {
          case "no_seat":
            limitCode = "no_seat";
            break;
          case "user_cap_reached":
            limitCode = "user_credits_exhausted";
            break;
          case "credits_exhausted":
            limitCode = "pool_credits_exhausted";
            break;
          default:
            assertNeverAndIgnore(userBlockedReason);
            limitCode = "pool_credits_exhausted";
            break;
        }
        setLimitReachedCode(limitCode);
        return new Err({
          code: "internal_error",
          name: "UserBlocked",
          message: "You are not allowed to send messages.",
        });
      }

      setIsSubmitting(true);

      const conversationRes = await createConversationWithMessage({
        messageData: {
          input,
          mentions: mentions.map(toMentionType),
          contentFragments,
          clientSideMCPServerIds,
          selectedMCPServerViewIds,
          richMentions: mentions,
        },
        // Navigate as soon as the conversation exists; the first message is posted
        // in the background by useCreateConversationWithMessage. Background-post
        // failures (e.g. no seat, credits) are surfaced through `onError` so the
        // same blocking popup shows even though the conversation already exists.
        deferMessage: true,
        onError: handleSubmitMessageError,
      });

      setIsSubmitting(false);

      if (conversationRes.isErr()) {
        handleSubmitMessageError(conversationRes.error);

        return new Err({
          code: "internal_error",
          name: conversationRes.error.title,
          message: conversationRes.error.message,
        });
      } else {
        // We start the push before creating the message to optimize for instantaneity as well.
        await router.push(
          getConversationRoute(owner.sId, conversationRes.value.sId),
          undefined,
          { shallow: true }
        );

        await mutateConversations(
          (currentData: ConversationListItemType[] | undefined) => [
            // Prepend so the new conversation appears at the top of the DESC-sorted list.
            conversationRes.value,
            ...(currentData ?? []),
          ],
          { revalidate: false }
        );

        return new Ok(undefined);
      }
    },
    [
      isSubmitting,
      userBlockedReason,
      mutateConversations,
      owner,
      router,
      handleSubmitMessageError,
      createConversationWithMessage,
      clientSideMCPServerIds,
    ]
  );

  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

  const { startConversationRef } = useWelcomeTourGuide();

  // Forces a full remount of ConversationViewer (Virtuoso list, messages, InputBar)
  // when switching conversations.
  const conversationViewerKey = activeConversationId;

  const body = (
    <DropzoneContainer
      description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
      title="Attach files to the conversation"
    >
      {activeConversationId ? (
        <ConversationViewer
          owner={owner}
          user={user}
          conversationId={activeConversationId}
          setLimitReachedCode={setLimitReachedCode}
          limitReachedCode={limitReachedCode}
          key={conversationViewerKey}
          clientSideMCPServerIds={clientSideMCPServerIds}
        />
      ) : (
        <>
          <div
            id="agent-input-header"
            className="flex h-fit w-full max-w-conversation flex-col justify-end gap-8 py-4 md:min-h-[20vh]"
            ref={startConversationRef}
          >
            <Page.Header title={greeting} />
          </div>
          <div
            className={classNames(
              "sticky bottom-0 z-20 flex max-h-dvh w-full",
              "pb-2",
              "sm:w-full sm:max-w-conversation sm:pb-4"
            )}
          >
            <InputBar
              owner={owner}
              user={user}
              onSubmit={handleConversationCreation}
              draftKey="home-new-conversation"
              disableAutoFocus={false}
              defaultAgentId={workspaceDefaultAgentId}
            />
          </div>

          {suggestion && (
            <div className="w-full max-w-conversation mt-1">
              <Card
                variant="highlight"
                size="md"
                containerClassName="w-full group"
              >
                <div className="flex w-full flex-col gap-2 text-sm">
                  <div className="flex w-full items-center gap-2 font-semibold text-highlight-600 dark:text-highlight-400">
                    <Lightbulb04 className="text-highlight-600 dark:text-highlight-400 h-5 w-5" />
                    <div className="w-full">{suggestion.title}</div>
                    <div className="opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={XClose}
                        tooltip="Dismiss"
                        onClick={() => onDismissSuggestion?.(suggestion.id)}
                        className="text-highlight-600 dark:text-highlight-400"
                      />
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {suggestion.description}
                  </div>
                </div>
              </Card>
            </div>
          )}
          <AgentBrowserContainer
            onAgentConfigurationClick={(agent) => {
              setSelectedSingleAgent(toRichAgentMentionType(agent));
            }}
            owner={owner}
            user={user}
          />
        </>
      )}
      <ReachedLimitPopup
        isAdmin={isAdmin(owner)}
        isOpened={!!limitReachedCode}
        onClose={() => setLimitReachedCode(null)}
        subscription={subscription}
        owner={owner}
        code={limitReachedCode ?? "message_limit"}
      />
    </DropzoneContainer>
  );

  // we wrap the body in a div to avoid a bug with the virtuoso scrolling
  // when there is no active conversation
  return activeConversationId ? (
    body
  ) : (
    <ScrollArea className="px-4 md:px-8">{body}</ScrollArea>
  );
}
