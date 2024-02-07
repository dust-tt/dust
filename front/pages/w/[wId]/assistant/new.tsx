import {
  AssistantPreview2,
  Avatar,
  BookOpenIcon,
  Button,
  ChatBubbleBottomCenterTextIcon,
  CloudArrowLeftRightIcon,
  FolderOpenIcon,
  Page,
  Popup,
  RobotSharedIcon,
} from "@dust-tt/sparkle";
import type {
  AgentMention,
  ContentFragmentContentType,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import Conversation from "@app/components/assistant/conversation/Conversation";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { compareAgentsForSort } from "@app/lib/assistant";
import { Authenticator, getSession } from "@app/lib/auth";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAgentConfigurations } from "@app/lib/swr";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withGetServerSidePropsLogging<{
  user: UserType;
  isBuilder: boolean;
  subscription: SubscriptionType;
  owner: WorkspaceType;
  gaTrackingId: string;
}>(async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

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

  return {
    props: {
      user,
      isBuilder: auth.isBuilder(),
      owner,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function AssistantNew({
  user,
  isBuilder,
  owner,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [planLimitReached, setPlanLimitReached] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);
  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );

  // No limit on global assistants call as they include both active and inactive.
  const globalAgentConfigurations = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "global",
    includes: ["authors"],
    sort: "priority",
  }).agentConfigurations;

  const workspaceAgentConfigurations = isBuilder
    ? []
    : useAgentConfigurations({
        workspaceId: owner.sId,
        agentsGetView: "workspace",
        includes: ["authors"],
        limit: 2,
        sort: "alphabetical",
      }).agentConfigurations;

  const displayedAgents = [
    ...globalAgentConfigurations,
    ...workspaceAgentConfigurations,
  ]
    .filter((a) => a.status === "active")
    // Sort is necessary due to separately fetched global and workspace assistants, ensuring unified ordering.
    .sort(compareAgentsForSort)
    .slice(0, isBuilder ? 2 : 4);

  const { submit: handleSubmit } = useSubmitFunction(
    async (
      input: string,
      mentions: MentionType[],
      contentFragment?: {
        title: string;
        content: string;
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
        // We use this to clear the UI start rendering the conversation immediately to give an
        // impression of instantaneity.
        setConversation(conversationRes.value);

        // We start the push before creating the message to optimize for instantaneity as well.
        void router.push(
          `/w/${owner.sId}/assistant/${conversationRes.value.sId}`
        );
      }
    }
  );

  const [shouldAnimateInput, setShouldAnimateInput] = useState<boolean>(false);
  const [greeting, setGreeting] = useState<string>("");
  const [selectedAssistant, setSelectedAssistant] =
    useState<AgentMention | null>(null);
  const [showDetails, setShowDetails] =
    useState<LightAgentConfigurationType | null>(null);

  const triggerInputAnimation = () => {
    setShouldAnimateInput(true);
  };

  useEffect(() => {
    if (shouldAnimateInput) {
      setShouldAnimateInput(false);
    }
  }, [shouldAnimateInput]);

  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

  return (
    <InputBarContext.Provider
      value={{ animate: shouldAnimateInput, selectedAssistant }}
    >
      <GenerationContextProvider>
        <AppLayout
          subscription={subscription}
          owner={owner}
          isWideMode={conversation ? true : false}
          pageTitle={"Dust - New Conversation"}
          gaTrackingId={gaTrackingId}
          topNavigationCurrent="conversations"
          navChildren={
            <AssistantSidebarMenu
              owner={owner}
              triggerInputAnimation={triggerInputAnimation}
            />
          }
        >
          {showDetails && (
            <AssistantDetails
              owner={owner}
              assistantId={showDetails.sId}
              show={showDetails !== null}
              onClose={() => {
                setShowDetails(null);
              }}
            />
          )}
          {!conversation ? (
            <div className="flex h-full items-center pb-20">
              <div className="flex text-sm font-normal text-element-800">
                <Page.Vertical gap="md" align="left">
                  {/* FEATURED AGENTS */}
                  <Page.Vertical gap="lg" align="left">
                    <div className="flex w-full flex-row gap-4">
                      <div className="flex w-full flex-row justify-between">
                        <Page.SectionHeader title={greeting} />
                        {!isBuilder && (
                          <Link href={`/w/${owner.sId}/assistant/gallery`}>
                            <Button
                              variant="primary"
                              icon={BookOpenIcon}
                              size="xs"
                              label="Explore the Assistants Gallery"
                            />
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-8 sm:flex-row sm:gap-2">
                      <div className="flex w-full flex-col gap-2">
                        {isBuilder && (
                          <>
                            <div className="text-base font-bold text-element-800">
                              Assistants
                            </div>
                            <Link href={`/w/${owner.sId}/builder/assistants`}>
                              <Button
                                variant="secondary"
                                icon={RobotSharedIcon}
                                size="xs"
                                label="Manage Assistants"
                              />
                            </Link>
                          </>
                        )}
                        <div
                          className={`grid grid-cols-2 items-start gap-4 py-2 ${
                            isBuilder ? "" : "sm:grid-cols-4"
                          }`}
                        >
                          {displayedAgents.map((agent) => (
                            <AssistantPreview2
                              variant="item"
                              title={agent.name}
                              description={agent.description}
                              pictureUrl={agent.pictureUrl}
                              key={agent.sId}
                              onClick={() => {
                                setShowDetails(agent);
                              }}
                              subtitle={agent.lastAuthors?.join(", ") || ""}
                              actions={
                                <div className="s-flex s-justify-end">
                                  <Button
                                    icon={ChatBubbleBottomCenterTextIcon}
                                    label="Chat"
                                    variant="tertiary"
                                    size="xs"
                                    onClick={(e) => {
                                      e.stopPropagation();

                                      setSelectedAssistant({
                                        configurationId: agent.sId,
                                      });
                                      setShouldAnimateInput(true);
                                    }}
                                  />
                                </div>
                              }
                            />
                          ))}
                        </div>
                        <Button.List isWrapping={true}>
                          <div className="flex flex-wrap gap-2">
                            <StartHelperConversationButton
                              content="@help, what can I use the assistants for?"
                              handleSubmit={handleSubmit}
                            />
                            <StartHelperConversationButton
                              content="@help, what are the limitations of assistants?"
                              handleSubmit={handleSubmit}
                            />
                          </div>
                        </Button.List>
                      </div>
                      {isBuilder && (
                        <div className="flex w-full flex-col gap-2">
                          <div className="text-base font-bold text-element-800">
                            Data Sources
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/w/${owner.sId}/builder/data-sources/managed`}
                            >
                              <Button
                                variant="secondary"
                                icon={CloudArrowLeftRightIcon}
                                size="xs"
                                label="Manage Connections"
                              />
                            </Link>
                            <Link
                              href={`/w/${owner.sId}/builder/data-sources/static`}
                            >
                              <Button
                                variant="secondary"
                                icon={FolderOpenIcon}
                                size="xs"
                                label={"Manage Folders"}
                              />
                            </Link>
                          </div>
                          <div className="flex flex-wrap gap-2 py-2">
                            <Link
                              href={`/w/${owner.sId}/builder/data-sources/managed`}
                              className="flex flex-wrap gap-2 py-2"
                            >
                              <Avatar
                                size="md"
                                visual="https://dust.tt/static/systemavatar/drive_avatar_full.png"
                              />
                              <Avatar
                                size="md"
                                visual="https://dust.tt/static/systemavatar/notion_avatar_full.png"
                              />
                              <Avatar
                                size="md"
                                visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
                              />
                              <Avatar
                                size="md"
                                visual="https://dust.tt/static/systemavatar/github_avatar_full.png"
                              />
                              <Avatar
                                size="md"
                                visual="https://dust.tt/static/systemavatar/intercom_avatar_full.png"
                              />
                            </Link>
                          </div>
                          <div className="py-0.5 text-xs font-normal text-element-700">
                            Manage access to your company’s knowledge and data
                            through connections (to GDrive, Notion,...) and
                            uploads (Folder).
                          </div>
                          <Button.List isWrapping={true}>
                            <div className="flex flex-wrap gap-2">
                              <StartHelperConversationButton
                                content="@help, tell me about Data Sources"
                                handleSubmit={handleSubmit}
                              />
                            </div>
                          </Button.List>
                        </div>
                      )}
                    </div>
                  </Page.Vertical>
                </Page.Vertical>
              </div>
            </div>
          ) : (
            <Conversation
              owner={owner}
              user={user}
              conversationId={conversation.sId}
            />
          )}

          <FixedAssistantInputBar
            owner={owner}
            onSubmit={handleSubmit}
            conversationId={conversation?.sId || null}
          />
          <LimitReachedPopup
            planLimitReached={planLimitReached}
            workspaceId={owner.sId}
          />
        </AppLayout>
      </GenerationContextProvider>
    </InputBarContext.Provider>
  );
}

function StartHelperConversationButton({
  content,
  handleSubmit,
  variant = "tertiary",
  size = "xs",
}: {
  content: string;
  handleSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragment?: {
      title: string;
      content: string;
      contentType: ContentFragmentContentType;
    }
  ) => Promise<void>;
  variant?: "primary" | "secondary" | "tertiary";
  size?: "sm" | "xs";
}) {
  const contentWithMarkdownMention = content.replace(
    "@help",
    ":mention[help]{sId=helper}"
  );

  return (
    <Button
      variant={variant}
      icon={ChatBubbleBottomCenterTextIcon}
      label={content}
      size={size}
      hasMagnifying={false}
      onClick={() => {
        void handleSubmit(contentWithMarkdownMention, [
          {
            configurationId: "helper",
          },
        ]);
      }}
    />
  );
}

export function LimitReachedPopup({
  planLimitReached,
  workspaceId,
}: {
  planLimitReached: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  return (
    <Popup
      show={planLimitReached}
      chipLabel="Free plan"
      description="Looks like you've used up all your messages. Check out our paid plans to get unlimited messages."
      buttonLabel="Check Dust plans"
      buttonClick={() => {
        void router.push(`/w/${workspaceId}/subscription`);
      }}
      className="fixed bottom-16 right-16"
    />
  );
}
