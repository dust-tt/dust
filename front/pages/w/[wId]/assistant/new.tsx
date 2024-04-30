import {
  Avatar,
  Button,
  ContextItem,
  HeartAltIcon,
  Page,
  PlusIcon,
  Searchbar,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  LightAgentConfigurationType,
  MentionType,
  UserType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useContext, useEffect, useState } from "react";

import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import ConversationLayout from "@app/components/assistant/conversation/ConversationLayout";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { SCOPE_INFO } from "@app/components/assistant/Sharing";
import { QuickStartGuide } from "@app/components/quick_start_guide";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import { compareAgentsForSort } from "@app/lib/assistant";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAgentConfigurations, useUserMetadata } from "@app/lib/swr";
import { setUserMetadataFromClient } from "@app/lib/user";
import { subFilter } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<
  ConversationLayoutProps & {
    user: UserType;
    isBuilder: boolean;
    helper: LightAgentConfigurationType | null;
  }
>(async (context, auth) => {
  const owner = auth.workspace();
  const user = auth.user();
  const subscription = auth.subscription();

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
    },
  };
});

export default function AssistantNew({
  isBuilder,
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [planLimitReached, setPlanLimitReached] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);

  // No limit on global assistants call as they include both active and inactive.
  const globalAgentConfigurations = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "global",
    includes: ["authors"],
    sort: "priority",
  }).agentConfigurations;

  const {
    agentConfigurations,
    isAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    includes: ["authors"],
  });

  const workspaceAgentConfigurations = isBuilder
    ? []
    : useAgentConfigurations({
        workspaceId: owner.sId,
        agentsGetView: "workspace",
        includes: ["authors"],
        limit: 2,
        sort: "alphabetical",
      }).agentConfigurations;

      const [assistantSearch, setAssistantSearch] = useState<string>("");
    
      const searchFilteredAssistants = agentConfigurations.filter((a) => {
        return subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase());
      });

  const displayedAgents = [
    ...globalAgentConfigurations,
    ...workspaceAgentConfigurations,
  ]
    .filter((a) => a.status === "active")
    // Sort is necessary due to separately fetched global and workspace assistants, ensuring unified ordering.
    .sort(compareAgentsForSort)
    .slice(0, isBuilder ? 2 : 4);

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


  const [greeting, setGreeting] = useState<string>("");
  const { animate, setAnimate } =
    useContext(InputBarContext);

  useEffect(() => {
    if (animate) {
      setAnimate(false);
    }
  }, [animate, setAnimate]);

  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

  const { submit: persistQuickGuideSeen } = useSubmitFunction(async () => {
    setUserMetadataFromClient({ key: "quick_guide_seen", value: "true" })
      .then(() => {
        return mutateQuickGuideSeen();
      })
      .catch(console.error);
    setShowQuickGuide(false);
  });

  return (
    <>
      <QuickStartGuide
        owner={owner}
        user={user}
        show={showQuickGuide}
        onClose={() => {
          void persistQuickGuideSeen();
        }}
      />
      <div className="flex h-full items-center pb-20">
        <div className="flex flex-col text-sm font-normal text-element-800 w-full h-full">
          <div id="assistant-input-container" className="flex flex-col h-[70%] items-center justify-center w-full">
            <div className="flex w-full flex-col justify-between px-4 py-2 mb-4">
              <Page.SectionHeader title={greeting} />
              <Page.SectionHeader title="Start a conversation" />
            </div>
            <div id="assistant-input-bar" className="flex items-center justify-center w-full">
              <AssistantInputBar
                owner={owner}
                onSubmit={handleSubmit}
                conversationId={null}
                hideQuickActions={false}
                disableAutoFocus={false}
                animationDelay={700}
              />
            </div>
          </div>

      <div className="flex flex-col gap-4 pt-9 h-80 w-full px-4">
      <Page.SectionHeader title="Chat with..." />
        <div id="search-container" className="flex flex-row gap-4 w-full justify-center align-middle items-center">
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
        <ContextItem.List>
          {displayedAgents.length === 0 && searchFilteredAssistants.length === 0 &&
            !isAgentConfigurationsLoading && (
              <ContextItem
                title="No assistant found matching the search."
                visual={undefined}
              />
            )}
          {["private", "published", "workspace", "global"].map((scope) => (
            <ScopeSection
              key={scope}
              assistantList={displayedAgents.concat(searchFilteredAssistants)}
              scope={scope as AgentConfigurationScope}
              setAnimate={setAnimate}
            />
          ))}
        </ContextItem.List>
      </div>
        </div>
      </div>

      <div 
  id="quick-start-guide-button"
  className="fixed top-4 right-6 lg:bottom-6 lg:right-6 lg:top-auto z-50"
>
  <Button
    icon={HeartAltIcon}
    labelVisible={false}
    label="Quick Start Guide"
    onClick={() => setShowQuickGuide(true)}
    size="sm"
    tooltipPosition="below"
    variant="primary"
    hasMagnifying={true}
    disabledTooltip={false}
    className=""
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

function ScopeSection({
  assistantList,
  scope,
  setAnimate, // Add this prop to pass the setAnimate function
}: {
  assistantList: LightAgentConfigurationType[];
  scope: AgentConfigurationScope;
  setAnimate: (animate: boolean) => void; // Add this type
}) {
  const { setSelectedAssistant } = useContext(InputBarContext);

  const filteredList = assistantList.filter((a) => a.scope === scope);
  if (filteredList.length === 0) {
    return null;
  }

  const scrollToInputBar = () => {
    const scrollContainerElement = document.getElementById("assistant-input-container");
    if (scrollContainerElement) {
      scrollContainerElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <ContextItem.SectionHeader
        title={SCOPE_INFO[scope].label + "s"}
        description={SCOPE_INFO[scope].text}
      />
      {filteredList.map((agent) => (
        <ContextItem
          key={agent.sId}
          title={`@${agent.name}`}
          subElement={`By: ${agent.lastAuthors?.map((a) => a).join(", ")}`}
          visual={<Avatar visual={agent.pictureUrl} size="md" />}
          onClick={() => {
            setSelectedAssistant({
              configurationId: agent.sId,
            });
            setAnimate(true);
            setTimeout(() => {
              scrollToInputBar();
            }, 0);
          }}
        >
          <ContextItem.Description>
            <div className="line-clamp-2 text-element-700">
              {agent.description}
            </div>
          </ContextItem.Description>
        </ContextItem>
      ))}
    </>
  );
}
