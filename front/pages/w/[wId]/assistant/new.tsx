import {
  Button,
  HeartAltIcon,
  Page,
  PlanetIcon,
  PlusIcon,
  RobotIcon,
  RocketIcon,
  Searchbar,
  Spinner,
  Tab,
  Tooltip,
  UserGroupIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  MentionType,
  PlanType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { AssistantList } from "@app/components/assistant/AssistantList";
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
import { useUserMetadata } from "@app/lib/swr";
import { setUserMetadataFromClient } from "@app/lib/user";
import { subFilter } from "@app/lib/utils";

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

const ALL_AGENTS_TABS = [
  // ordering here is used to determine the default tab
  { label: "Most popular", icon: RocketIcon, id: "most_popular" },
  { label: "Company", icon: PlanetIcon, id: "workspace" },
  { label: "Shared", icon: UserGroupIcon, id: "published" },
  { label: "Personal", icon: UserIcon, id: "personal" },
  { label: "All", icon: RobotIcon, id: "all" },
] as const;

type TabId = (typeof ALL_AGENTS_TABS)[number]["id"];

export default function AssistantNew({
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [assistantSearch, setAssistantSearch] = useState<string>("");

  const [planLimitReached, setPlanLimitReached] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);
  const {
    setAnimate,
    setSelectedAssistant,
    inputBarAssistants: agentConfigurations,
    inputBarAssistantsLoading: isAgentConfigurationsLoading,
  } = useContext(InputBarContext);

  const agentsByTab = useMemo(() => {
    const filteredAgents: LightAgentConfigurationType[] =
      agentConfigurations.filter(
        (a) =>
          a.status === "active" &&
          // Filters on search query
          (assistantSearch.trim() === "" ||
            subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase()))
      );

    return {
      all: filteredAgents,
      published: filteredAgents.filter((a) => a.scope === "published"),
      workspace: filteredAgents.filter((a) => a.scope === "workspace"),
      personal: filteredAgents.filter((a) => a.scope === "private"),
      // TODO: Implement most popular agents (upcoming PR for issue #5454)
      most_popular: filteredAgents
        .filter((a) => a.usage && a.usage.messageCount > 0)
        .sort(
          (a, b) => (b.usage?.messageCount || 0) - (a.usage?.messageCount || 0)
        )
        .slice(0, 0), // Placeholder -- most popular agents are not implemented yet
    };
  }, [agentConfigurations, assistantSearch]);

  const visibleTabs = useMemo(() => {
    return ALL_AGENTS_TABS.filter((tab) => agentsByTab[tab.id].length > 0);
  }, [agentsByTab]);

  const [selectedTab, setSelectedTab] = useState<TabId | null>(
    visibleTabs[0]?.id || null
  );

  const displayedTab = visibleTabs.find((tab) => tab.id === selectedTab)
    ? selectedTab
    : visibleTabs.length > 0
    ? visibleTabs[0].id
    : null;

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

  const handleAssistantClick = useCallback(
    async (agent: LightAgentConfigurationType) => {
      // scroll to inputbar title
      const scrollContainerElement = document.getElementById(
        "assistant-input-header"
      );
      console.log(
        "y delta of scroll container with current scroll position:" +
          scrollContainerElement?.getBoundingClientRect().top
      );

      if (scrollContainerElement) {
        scrollContainerElement.scrollIntoView({ behavior: "smooth" });
        const waitScrollDelay =
          -scrollContainerElement?.getBoundingClientRect().top * 0.8;
        // wait for end of scroll
        await new Promise((resolve) => setTimeout(resolve, waitScrollDelay));
      }

      setSelectedAssistant({
        configurationId: agent.sId,
      });

      // animate input bar
      setAnimate(true);
      await new Promise((resolve) => setTimeout(resolve, 500));
      setAnimate(false);
    },
    [setSelectedAssistant, setAnimate]
  );

  /*useEffect(() => {
    if (contentRef.current) {
      setContentMinHeight(contentRef.current.offsetHeight);
    }
  }, [selectedTab]);*/

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
            className="flex h-fit w-full items-center justify-center"
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

        {/* Assistants */}
        <div
          id="assistants-lists-container"
          className="flex h-full w-full flex-col gap-3 pt-9"
        >
          <div id="assistants-list-header" className="px-4">
            <Page.SectionHeader title="Chat with..." />
          </div>

          {/* Search bar */}
          <div
            id="search-container"
            className="flex w-full flex-row items-center justify-center gap-4 px-4 align-middle"
          >
            <Searchbar
              name="search"
              size="sm"
              placeholder="Search (Name)"
              value={assistantSearch}
              onChange={setAssistantSearch}
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

          {/* Assistant tabs */}
          <div id="all-assistants-header" className="flex h-fit px-4">
            <Page.SectionHeader title="Available assistants" />
          </div>
          <div className="flex flex-row space-x-4 px-4">
            <Tab
              className="grow"
              tabs={visibleTabs.map((tab) => ({
                ...tab,
                current: tab.id === displayedTab,
              }))}
              setCurrentTab={setSelectedTab}
            />
          </div>
          {(() => {
            if (isAgentConfigurationsLoading) {
              return (
                <div className="flex grow justify-center">
                  <Spinner />
                </div>
              );
            }

            if (!displayedTab) {
              return (
                <div className="text-center">
                  No assistants found. Try adjusting your search criteria.
                </div>
              );
            }

            return (
              <AssistantList
                agents={agentsByTab[displayedTab]}
                handleAssistantClick={handleAssistantClick}
              />
            );
          })()}
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
