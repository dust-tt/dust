import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
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
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import type { DustError } from "@app/lib/error";
import { useAppRouter } from "@app/lib/platform";
import { classNames } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import {
  toMentionType,
  toRichAgentMentionType,
} from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { SubscriptionType } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { Page } from "@dust-tt/sparkle";
import { useCallback, useContext, useEffect, useState } from "react";

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
  const activeConversationId = useActiveConversationId();

  const [planLimitReached, setPlanLimitReached] = useState(false);

  const { setSelectedAgent } = useContext(InputBarContext);

  const router = useAppRouter();

  const sendNotification = useSendNotification();

  const { mutateConversations } = useConversations({ workspaceId: owner.sId });

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConversationCreation = useCallback(
    async (
      input: string,
      mentions: RichMention[],
      contentFragments: ContentFragmentsType,
      selectedMCPServerViewIds?: string[],
      selectedSkillIds?: string[]
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
        messageData: {
          input,
          mentions: mentions.map(toMentionType),
          contentFragments,
          selectedMCPServerViewIds,
          selectedSkillIds,
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
          getConversationRoute(owner.sId, conversationRes.value.sId),
          undefined,
          { shallow: true }
        );

        await mutateConversations(
          (currentData: ConversationWithoutContentType[] | undefined) => [
            // Immediately update the list of conversations in the sidebar by adding the new conversation.
            ...(currentData ?? []),
            conversationRes.value,
          ],
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
      createConversationWithMessage,
    ]
  );

  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

  const { startConversationRef } = useWelcomeTourGuide();

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
          setPlanLimitReached={setPlanLimitReached}
        />
      ) : (
        <>
          <div
            id="agent-input-header"
            className="flex h-fit min-h-[20vh] w-full max-w-3xl flex-col justify-end gap-8 py-4"
            ref={startConversationRef}
          >
            <Page.Header title={greeting} />
          </div>
          <div
            className={classNames(
              "sticky bottom-0 z-20 flex max-h-dvh w-full",
              "pb-2",
              "sm:w-full sm:max-w-3xl sm:pb-4"
            )}
          >
            <InputBar
              owner={owner}
              user={user}
              onSubmit={handleConversationCreation}
              draftKey="home-new-conversation"
              disableAutoFocus={false}
            />
          </div>
          <AgentBrowserContainer
            onAgentConfigurationClick={(agent) => {
              setSelectedAgent(toRichAgentMentionType(agent));
            }}
            owner={owner}
            user={user}
          />
        </>
      )}
      <ReachedLimitPopup
        isAdmin={isAdmin(owner)}
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
