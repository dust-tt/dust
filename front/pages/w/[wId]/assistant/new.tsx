import {
  AssistantPreview,
  Avatar,
  Button,
  ChatBubbleBottomCenterTextIcon,
  CloudArrowLeftRightIcon,
  FolderOpenIcon,
  Page,
  QuestionMarkCircleIcon,
  RobotSharedIcon,
} from "@dust-tt/sparkle";
import type {
  ConversationType,
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
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { TryAssistantModal } from "@app/components/assistant/TryAssistant";
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
  helper,
  isBuilder,
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [planLimitReached, setPlanLimitReached] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);
  const [conversationHelperModal, setConversationHelperModal] =
    useState<ConversationType | null>(null);

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

  const { submit: handleOpenHelpConversation } = useSubmitFunction(
    async (content: string) => {
      // We create a new test conversation with the helper and we open it in the Drawer
      const conversationRes = await createConversationWithMessage({
        owner,
        user,
        messageData: {
          input: content.replace("@help", ":mention[help]{sId=helper}"),
          mentions: [{ configurationId: "helper" }],
        },
        visibility: "test",
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
        setConversationHelperModal(conversationRes.value);
      }
    }
  );

  const [greeting, setGreeting] = useState<string>("");
  const { animate, setAnimate, setSelectedAssistant } =
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
      <div className="flex h-full items-center pb-20">
        <div className="flex text-sm font-normal text-element-800">
          <Page.Vertical gap="md" align="left">
            {/* FEATURED AGENTS */}
            <Page.Vertical gap="lg" align="left">
              <div className="flex w-full flex-row gap-4">
                <div className="flex w-full flex-row justify-between">
                  <Page.SectionHeader title={greeting} />

                  <div className="flex-cols flex gap-2">
                    <div>
                      <Button
                        icon={QuestionMarkCircleIcon}
                        variant="tertiary"
                        label="Quick Start Guide"
                        size="xs"
                        onClick={() => {
                          setShowQuickGuide(true);
                        }}
                      />
                    </div>
                  </div>
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
                    {displayedAgents.map((agent) => {
                      const href = {
                        pathname: router.pathname,
                        query: {
                          ...router.query,
                          assistantDetails: agent.sId,
                        },
                      };

                      return (
                        <Link
                          href={href}
                          key={agent.sId}
                          shallow
                          className="cursor-pointer duration-300 hover:text-action-500 active:text-action-600"
                        >
                          <AssistantPreview
                            variant="item"
                            title={agent.name}
                            description={agent.description}
                            pictureUrl={agent.pictureUrl}
                            key={agent.sId}
                            subtitle={agent.lastAuthors?.join(", ") || ""}
                            actions={
                              <div className="s-flex s-justify-end">
                                <Button
                                  icon={ChatBubbleBottomCenterTextIcon}
                                  label="Chat"
                                  variant="tertiary"
                                  size="xs"
                                  onClick={(e) => {
                                    // Prevent click event from propagating to parent component.
                                    e.preventDefault();

                                    setSelectedAssistant({
                                      configurationId: agent.sId,
                                    });
                                    setAnimate(true);
                                  }}
                                />
                              </div>
                            }
                          />
                        </Link>
                      );
                    })}
                  </div>
                  <Button.List isWrapping={true}>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="tertiary"
                        icon={ChatBubbleBottomCenterTextIcon}
                        label={"@help, what can I use the assistants for?"}
                        size="xs"
                        hasMagnifying={false}
                        onClick={async () => {
                          await handleOpenHelpConversation(
                            "@help, what can I use the assistants for?"
                          );
                        }}
                      />
                      <Button
                        variant="tertiary"
                        icon={ChatBubbleBottomCenterTextIcon}
                        label={"@help, what are the limitations of assistants?"}
                        size="xs"
                        hasMagnifying={false}
                        onClick={async () => {
                          await handleOpenHelpConversation(
                            "@help, what are the limitations of assistants?"
                          );
                        }}
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
                      Manage access to your company’s knowledge and data through
                      connections (to GDrive, Notion,...) and uploads (Folder).
                    </div>
                    <Button.List isWrapping={true}>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="tertiary"
                          icon={ChatBubbleBottomCenterTextIcon}
                          label={"@help, tell me about Data Sources"}
                          size="xs"
                          hasMagnifying={false}
                          onClick={async () => {
                            await handleOpenHelpConversation(
                              "@help, tell me about Data Sources"
                            );
                          }}
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

      <FixedAssistantInputBar
        owner={owner}
        onSubmit={handleSubmit}
        conversationId={null}
      />
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
