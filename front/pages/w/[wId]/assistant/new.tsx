import { Button, HeartAltIcon, Page } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  MentionType,
  PlanType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { AssistantBrowser } from "@app/components/assistant/AssistantBrowser";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import ConversationLayout from "@app/components/assistant/conversation/ConversationLayout";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { ContentFragmentInput } from "@app/components/assistant/conversation/lib";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { QuickStartGuide } from "@app/components/quick_start_guide";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAgentConfigurations, useUserMetadata } from "@app/lib/swr";
import { setUserMetadataFromClient } from "@app/lib/user";
import { classNames } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<
  ConversationLayoutProps & {
    user: UserType;
    owner: WorkspaceType;
    plan: PlanType | null;
    isBuilder: boolean;
    helper: LightAgentConfigurationType | null;
  }
>(async (context, auth) => {
  const owner = auth.workspace();
  const user = auth.user();
  const subscription = auth.subscription();
  const plan = auth.plan();

  if (!owner || !auth.isUser() || !subscription || !user) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const helper = await getAgentConfiguration(auth, "helper");

  return {
    props: {
      baseUrl: config.getAppUrl(),
      conversationId: null,
      gaTrackingId: GA_TRACKING_ID,
      helper,
      isBuilder: auth.isBuilder(),
      owner,
      subscription,
      user,
      plan,
    },
  };
});

export default function AssistantNew({
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [planLimitReached, setPlanLimitReached] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);

  const { animate, setAnimate, setSelectedAssistant } =
    useContext(InputBarContext);

  const assistantToMention = useRef<LightAgentConfigurationType | null>(null);

  // fast loading of a few company assistants so we can show them immediately
  const {
    agentConfigurations: initialAgentConfigurations,
    isAgentConfigurationsLoading: isInitialAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "workspace",
    limit: 24,
  });

  // we load all assistants with authors in the background
  const {
    agentConfigurations: agentConfigurationsWithAuthors,
    isAgentConfigurationsLoading: isAgentConfigurationsWithAuthorsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "assistants-search",
    includes: ["authors"],
  });

  const displayedAgentConfigurations = isAgentConfigurationsWithAuthorsLoading
    ? initialAgentConfigurations
    : agentConfigurationsWithAuthors;

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
          void router.push(
            `/w/${owner.sId}/assistant/${conversationRes.value.sId}`
          );
        }
      },
      [owner, user, router, sendNotification]
    )
  );

  const {
    metadata: quickGuideSeen,
    isMetadataError: isQuickGuideSeenError,
    isMetadataLoading: isQuickGuideSeenLoading,
    mutateMetadata: mutateQuickGuideSeen,
  } = useUserMetadata("quick_guide_seen");

  const [showQuickGuide, setShowQuickGuide] = useState<boolean>(false);
  const [greeting, setGreeting] = useState<string>("");

  const { submit: handleCloseQuickGuide } = useSubmitFunction(async () => {
    setUserMetadataFromClient({ key: "quick_guide_seen", value: "true" })
      .then(() => {
        return mutateQuickGuideSeen();
      })
      .catch(console.error);
    setShowQuickGuide(false);
  });

  useEffect(() => {
    if (!quickGuideSeen && !isQuickGuideSeenError && !isQuickGuideSeenLoading) {
      // Quick guide has never been shown, lets show it.
      setShowQuickGuide(true);
    }
  }, [isQuickGuideSeenError, isQuickGuideSeenLoading, quickGuideSeen]);

  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

  const setInputbarMention = useCallback(
    (agent: LightAgentConfigurationType) => {
      setSelectedAssistant({
        configurationId: agent.sId,
      });
      setAnimate(true);
    },
    [setSelectedAssistant, setAnimate]
  );

  const handleAssistantClick = useCallback(
    // on click, scroll to the input bar and set the selected assistant
    async (agent: LightAgentConfigurationType) => {
      const scrollContainerElement = document.getElementById(
        "assistant-input-header"
      );

      if (!scrollContainerElement) {
        console.log("Unexpected: scrollContainerElement not found");
        return;
      }
      const scrollDistance = scrollContainerElement.getBoundingClientRect().top;

      // If the input bar is already in view, set the mention directly. We leave
      // a little margin, -2 instead of 0, since the autoscroll below can
      // sometimes scroll a bit over 0, to -0.3 or -0.5, in which case if there
      // is a clic on a visible assistant we still want this condition to
      // trigger
      if (scrollDistance > -2) {
        setInputbarMention(agent);
        return;
      }

      // Otherwise, scroll to the input bar and set the ref (mention will be set via intersection observer)
      scrollContainerElement.scrollIntoView({ behavior: "smooth" });

      assistantToMention.current = agent;
    },
    [setInputbarMention]
  );

  useEffect(() => {
    if (animate) {
      setTimeout(() => setAnimate(false), 500);
    }
  });

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

  return (
    <>
      <QuickStartGuide
        owner={owner}
        user={user}
        show={showQuickGuide}
        onClose={() => {
          void handleCloseQuickGuide();
        }}
      />
      <div
        id="assistant-new-page"
        className="flex min-h-full flex-col items-center pb-10 text-sm font-normal text-element-800"
      >
        {/* Assistant input bar container*/}
        <div
          id="assistant-input-container"
          className="z-10 flex min-h-[50vh] w-full flex-col items-center justify-center"
        >
          <div
            id="assistant-input-header"
            className="mb-2 flex h-fit w-full flex-col justify-between px-4 py-2"
          >
            <Page.SectionHeader title={greeting} />
            <Page.SectionHeader title="Start a conversation" />
          </div>
          <div
            id="assistant-input-bar"
            className="flex h-fit w-full items-center justify-center text-base"
          >
            <AssistantInputBar
              owner={owner}
              onSubmit={handleMessageSubmit}
              conversationId={null}
              hideQuickActions={false}
              disableAutoFocus={false}
            />
          </div>
        </div>

        {/* Assistants browse section */}
        <div
          id="assistants-lists-container"
          className={classNames(
            "duration-400 flex h-full w-full flex-col gap-3 pt-9 transition-opacity",
            isInitialAgentConfigurationsLoading ? "opacity-0" : "opacity-100"
          )}
        >
          <div id="assistants-list-header" className="px-4">
            <Page.SectionHeader title="Chat with..." />
          </div>
          <AssistantBrowser
            owner={owner}
            agents={displayedAgentConfigurations}
            loadingStatus={
              isInitialAgentConfigurationsLoading
                ? "loading"
                : isAgentConfigurationsWithAuthorsLoading
                ? "partial"
                : "finished"
            }
            handleAssistantClick={handleAssistantClick}
          />
        </div>
      </div>

      {/* Quick start guide CTA */}
      <div
        id="quick-start-guide-button"
        className="fixed right-6 top-2 z-50 lg:bottom-6 lg:right-6 lg:top-auto"
      >
        <Button
          icon={HeartAltIcon}
          labelVisible={false}
          label="Quick Start Guide"
          onClick={() => setShowQuickGuide(true)}
          size="md"
          variant="primary"
          hasMagnifying={true}
          disabledTooltip={true}
          className="!border-emerald-600 !bg-brand"
        />
      </div>

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

AssistantNew.getLayout = (
  page: ReactElement,
  pageProps: ConversationLayoutProps
) => {
  return <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>;
};
