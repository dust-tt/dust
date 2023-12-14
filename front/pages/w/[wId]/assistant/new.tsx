import {
  BookOpenIcon,
  Button,
  ChatBubbleBottomCenterTextIcon,
  CloudArrowLeftRightIcon,
  FolderOpenIcon,
  Page,
  Popup,
} from "@dust-tt/sparkle";
import {
  AgentConfigurationType,
  AgentMention,
  ContentFragmentContentType,
  ConversationType,
  InternalPostConversationsRequestBodySchema,
  MentionType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import * as t from "io-ts";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { AssistantPreview } from "@app/components/assistant/AssistantPreview";
import Conversation from "@app/components/assistant/conversation/Conversation";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import {
  FixedAssistantInputBar,
  InputBarContext,
} from "@app/components/assistant/conversation/InputBar";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationConversations } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { compareAgentsForSort } from "@app/lib/assistant";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAgentConfigurations } from "@app/lib/swr";
import type { PostConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  isBuilder: boolean;
  subscription: SubscriptionType;
  owner: WorkspaceType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !auth.isUser() || !user || !subscription) {
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
};

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
  const { agentConfigurations, mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list",
    });

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  const displayedAgents = activeAgents.slice(0, isBuilder ? 2 : 4);

  const { submit: handleSubmit } = useSubmitFunction(
    async (
      input: string,
      mentions: MentionType[],
      contentFragment?: {
        title: string;
        content: string;
      }
    ) => {
      const body: t.TypeOf<typeof InternalPostConversationsRequestBodySchema> =
        {
          title: null,
          visibility: "unlisted",
          message: {
            content: input,
            context: {
              timezone:
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              profilePictureUrl: user.image,
            },
            mentions,
          },
          contentFragment: contentFragment
            ? {
                ...contentFragment,
                contentType: "file_attachment",
                url: null,
                context: {
                  profilePictureUrl: user.image,
                },
              }
            : undefined,
        };

      // Create new conversation and post the initial message at the same time.
      const cRes = await fetch(`/api/w/${owner.sId}/assistant/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!cRes.ok) {
        const data = await cRes.json();
        if (data.error.type === "test_plan_message_limit_reached") {
          setPlanLimitReached(true);
        } else {
          sendNotification({
            title: "Your message could not be sent",
            description:
              data.error.message || "Please try again or contact us.",
            type: "error",
          });
        }
        return;
      }

      const conversation = (
        (await cRes.json()) as PostConversationsResponseBody
      ).conversation;

      // We use this to clear the UI start rendering the conversation immediately to give an
      // impression of instantaneity.
      setConversation(conversation);

      // We start the push before creating the message to optimize for instantaneity as well.
      void router.push(`/w/${owner.sId}/assistant/${conversation.sId}`);
    }
  );

  const [shouldAnimateInput, setShouldAnimateInput] = useState<boolean>(false);
  const [selectedAssistant, setSelectedAssistant] =
    useState<AgentMention | null>(null);
  const [showDetails, setShowDetails] = useState<AgentConfigurationType | null>(
    null
  );

  const triggerInputAnimation = () => {
    setShouldAnimateInput(true);
  };

  useEffect(() => {
    if (shouldAnimateInput) {
      setShouldAnimateInput(false);
    }
  }, [shouldAnimateInput]);

  return (
    <InputBarContext.Provider
      value={{ animate: shouldAnimateInput, selectedAssistant }}
    >
      <GenerationContextProvider>
        <AppLayout
          subscription={subscription}
          user={user}
          owner={owner}
          isWideMode={conversation ? true : false}
          pageTitle={"Dust - New Conversation"}
          gaTrackingId={gaTrackingId}
          topNavigationCurrent="conversations"
          subNavigation={subNavigationConversations({
            owner,
            current: "conversation",
          })}
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
              assistant={showDetails}
              show={showDetails !== null}
              onClose={() => {
                setShowDetails(null);
              }}
              onUpdate={async () => {
                await mutateAgentConfigurations();
              }}
            />
          )}
          {!conversation ? (
            <div className="flex h-full items-center">
              <div className="flex text-sm font-normal text-element-800">
                <Page.Vertical gap="md" align="left">
                  {/* FEATURED AGENTS */}
                  <Page.Vertical gap="lg" align="left">
                    <Page.SectionHeader title="How can I help you today?" />
                    <div className="flex flex-row gap-2">
                      <div className="flex w-full flex-col gap-2">
                        {isBuilder && (
                          <div className="text-base font-bold text-element-800">
                            Your assistant team
                          </div>
                        )}
                        <div
                          className={`grid grid-cols-2 gap-4 py-2 ${
                            isBuilder ? "" : "sm:grid-cols-4"
                          }`}
                        >
                          {displayedAgents.map((agent) => (
                            <a
                              key={agent.sId}
                              className="cursor-pointer"
                              onClick={() => {
                                setSelectedAssistant({
                                  configurationId: agent.sId,
                                });
                                setShouldAnimateInput(true);
                              }}
                            >
                              <AssistantPreview
                                agentConfiguration={agent}
                                key={agent.sId}
                                owner={owner}
                                onShowDetails={() => {
                                  setShowDetails(agent);
                                }}
                                onUpdate={async () => {
                                  await mutateAgentConfigurations();
                                }}
                                variant="home"
                              />
                            </a>
                          ))}
                        </div>
                        <Button.List isWrapping={true}>
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/w/${owner.sId}/assistant/gallery?flow=conversation_add`}
                            >
                              <Button
                                variant="primary"
                                icon={BookOpenIcon}
                                size="xs"
                                label="Discover more in the Assistant Gallery"
                              />
                            </Link>
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
                          <div className="text-xs font-normal text-element-700">
                            Make assistants smarter by giving them access to
                            your company’s knowledge and data.
                          </div>
                          <Button.List isWrapping={true}>
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

                              <StartHelperConversationButton
                                content="@help, tell me about Data Sources"
                                variant="tertiary"
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
  variant = "secondary",
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
