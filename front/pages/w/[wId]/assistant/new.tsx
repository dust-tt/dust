import {
  Button,
  HeartAltIcon,
  Page,
  PlanetIcon,
  PlusIcon,
  Searchbar,
  Tab,
  Tooltip,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type {
  AgentsGetViewType,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  PlanType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ComponentType, ReactElement } from "react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import AssistantList from "@app/components/assistant/AssistantList";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import ConversationLayout from "@app/components/assistant/conversation/ConversationLayout";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { TryAssistantModal } from "@app/components/assistant/TryAssistant";
import { QuickStartGuide } from "@app/components/quick_start_guide";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAgentConfigurations, useUserMetadata } from "@app/lib/swr";
import { setUserMetadataFromClient } from "@app/lib/user";

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
  helper,
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentMinHeight, setContentMinHeight] = useState(0);
  const [agentsGetView] = useState<AgentsGetViewType>("all");
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const DEFAULT_TAB = "all";
  const [selectedTab, setSelectedTab] =
    useState<AgentsGetViewType>(DEFAULT_TAB);
  const [planLimitReached, setPlanLimitReached] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);
  const { setSelectedAssistant } = useContext(InputBarContext);
  const [conversationHelperModal, setConversationHelperModal] =
    useState<ConversationType | null>(null);

  const agentConfigurations = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView,
    includes: ["authors", "usage"],
  }).agentConfigurations;

  const frequentlyUsedByTeamAgents = useMemo(() => {
    return agentConfigurations
      .filter(
        (a) => a.status === "active" && a.usage && a.usage.messageCount > 0
      )
      .sort(
        (a, b) => (b.usage?.messageCount || 0) - (a.usage?.messageCount || 0)
      )
      .slice(0, 6);
  }, [agentConfigurations]);

  const agentsToDisplay = useMemo(() => {
    switch (selectedTab) {
      case "all":
        return agentConfigurations.filter((a) => a.status === "active");
      case "published":
        return agentConfigurations.filter(
          (a) => a.status === "active" && a.scope === "published"
        );
      case "workspace":
        return agentConfigurations.filter(
          (a) => a.status === "active" && a.scope === "workspace"
        );
      default:
        return [];
    }
  }, [selectedTab, agentConfigurations]);

  const allAgentsTabs: {
    label: string;
    current: boolean;
    id: AgentsGetViewType;
    icon?: ComponentType<{ className?: string }>;
  }[] = useMemo(
    () => [
      {
        label: "All",
        current: selectedTab === "all",
        id: "all",
      },
      {
        label: "Shared",
        current: selectedTab === "published",
        icon: UserGroupIcon,
        id: "published",
      },
      {
        label: "Company",
        current: selectedTab === "workspace",
        icon: PlanetIcon,
        id: "workspace",
      },
    ],
    [selectedTab]
  );

  const { submit: handleSubmit } = useSubmitFunction(
    useCallback(
      async (
        input: string,
        mentions: MentionType[],
        contentFragment?: {
          title: string;
          content: string;
          file: File;
        }
      ) => {
        const conversationRes = await createConversationWithMessage({
          owner,
          user,
          messageData: {
            input,
            mentions,
            contentFragment,
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

  useEffect(() => {
    if (!quickGuideSeen && !isQuickGuideSeenError && !isQuickGuideSeenLoading) {
      // Quick guide has never been shown, lets show it.
      setShowQuickGuide(true);
    }
  }, [isQuickGuideSeenError, isQuickGuideSeenLoading, quickGuideSeen]);

  const [greeting, setGreeting] = useState<string>("");
  const { animate, setAnimate } = useContext(InputBarContext);

  useEffect(() => {
    if (animate) {
      setAnimate(false);
    }
  }, [animate, setAnimate]);

  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

  const { submit: handleQuickGuideClose } = useSubmitFunction(async () => {
    setUserMetadataFromClient({ key: "quick_guide_seen", value: "true" })
      .then(() => {
        return mutateQuickGuideSeen();
      })
      .catch(console.error);
    setShowQuickGuide(false);
  });

  const scrollToInputBar = useCallback(() => {
    setTimeout(() => {
      const scrollContainerElement = document.getElementById(
        "assistant-input-header"
      );
      if (scrollContainerElement) {
        scrollContainerElement.scrollIntoView({ behavior: "smooth" });
      }
    }, 50); // Allows browser to complete the layout update before scrolling.
  }, []);

  const handleAssistantClick = (
    agent: LightAgentConfigurationType,
    conversation?: ConversationType
  ) => {
    scrollToInputBar();
    setSelectedAssistant({
      configurationId: agent.sId,
    });
    
    setConversationHelperModal(conversation || null);
    setTimeout(() => {
      setAnimate(true);
    }, 500);
  };

  useEffect(() => {
    if (contentRef.current) {
      setContentMinHeight(contentRef.current.offsetHeight);
    }
  }, [selectedTab]);

  return (
    <>
      <QuickStartGuide
        owner={owner}
        user={user}
        show={showQuickGuide}
        onClose={() => {
          void handleQuickGuideClose();
        }}
      />
      {conversationHelperModal && helper && (
        <TryAssistantModal
          owner={owner}
          user={user}
          title="Getting @help"
          assistant={helper}
          openWithConversation={conversationHelperModal}
          onClose={() => setConversationHelperModal(null)}
        />
      )}

      <div
        id="assistant-new-page"
        className="flex min-h-screen flex-col items-center pb-20 text-sm font-normal text-element-800"
      >
        {/* Assistant input */}
        <div
          id="assistant-input-container"
          className="flex min-h-[50vh] grow w-full flex-col items-center justify-center"
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
            className="flex h-fit w-full items-center justify-center"
          >
            <AssistantInputBar
              owner={owner}
              onSubmit={handleSubmit}
              conversationId={null}
              hideQuickActions={false}
              disableAutoFocus={false}
            />
          </div>
        </div>
        {/* Assistant list */}
        <div
          id="assistants-list-container"
          ref={contentRef}
          style={{ minHeight: `${contentMinHeight}px` }}
          className="flex h-full w-full flex-col gap-3 pt-9"
        >
          <div id="assistants-list-header" className="px-4">
            <Page.SectionHeader title="Chat with..." />
          </div>

          {/* Search */}
          <div
            id="search-container"
            className="flex w-full flex-row items-center justify-center gap-4 px-4 align-middle"
          >
            <Searchbar
              name="search"
              size="sm"
              placeholder="Search (Name)"
              value={assistantSearch}
              onChange={(s) => {
                setAssistantSearch(s);
              }}
            />
            <Button.List>
              <Tooltip label="Create your own assistant">
                <Link
                  href={`/w/${owner.sId}/builder/assistants/create?flow=personal_assistants`}
                >
                  <Button
                    variant="primary"
                    icon={PlusIcon}
                    label="Create An Assistant"
                    size="sm"
                  />
                </Link>
              </Tooltip>
            </Button.List>
          </div>

          {/* Frequently used by your team */}
          {frequentlyUsedByTeamAgents.length >= 0 && (
            <>
              <div
                id="frequently-used-by-your-team-header"
                className="flex h-fit px-4"
              >
                <Page.SectionHeader title="Frequently used" />
              </div>
              <AssistantList
                agents={frequentlyUsedByTeamAgents}
                handleAssistantClick={handleAssistantClick}
              />
            </>
          )}

          {/* All assistants */}
          <div id="all-assistants-header" className="flex h-fit px-4">
            <Page.SectionHeader title="All assistants" />
          </div>
          <div className="flex flex-row space-x-4 px-4">
            <Tab
              className="grow"
              tabs={allAgentsTabs}
              setCurrentTab={setSelectedTab}
            />
          </div>
          <AssistantList
            agents={agentsToDisplay}
            handleAssistantClick={handleAssistantClick}
          />
        </div>
      </div>

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
          className="!bg-brand !border-emerald-600"
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
