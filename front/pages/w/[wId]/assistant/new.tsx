import {
  ArrowDownCircleIcon,
  Avatar,
  Button,
  ChatBubbleBottomCenterTextIcon,
  Cog6ToothIcon,
  Icon,
  PageHeader,
  PlusCircleIcon,
  QuestionMarkCircleStrokeIcon,
} from "@dust-tt/sparkle";
import { ArrowUpCircleIcon } from "@heroicons/react/20/solid";
import { FlagIcon, HandRaisedIcon } from "@heroicons/react/24/outline";
import * as t from "io-ts";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import Conversation from "@app/components/assistant/conversation/Conversation";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/InputBar";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { compareAgentsForSort } from "@app/lib/assistant";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import type {
  PostConversationsRequestBodySchema,
  PostConversationsResponseBody,
} from "@app/pages/api/w/[wId]/assistant/conversations";
import {
  ConversationType,
  MentionType,
} from "@app/types/assistant/conversation";
import { UserType, WorkspaceType } from "@app/types/user";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  isBuilder: boolean;
  owner: WorkspaceType;
  baseUrl: string;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isUser() || !user) {
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
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AssistantNew({
  user,
  isBuilder,
  owner,
  baseUrl,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );
  const [showAllAgents, setShowAllAgents] = useState<boolean>(false);

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
  });

  let agents = agentConfigurations.filter((a) => a.status === "active");
  agents.sort(compareAgentsForSort);

  agents = showAllAgents ? agents : agents.slice(0, 4);

  const handleSubmit = async (input: string, mentions: MentionType[]) => {
    const body: t.TypeOf<typeof PostConversationsRequestBodySchema> = {
      title: null,
      visibility: "unlisted",
      message: {
        content: input,
        context: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          profilePictureUrl: user.image,
        },
        mentions,
      },
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
      window.alert(`Error creating conversation: ${data.error.message}`);
      return;
    }

    const conversation = ((await cRes.json()) as PostConversationsResponseBody)
      .conversation;

    // We use this to clear the UI start rendering the conversation immediately to give an
    // impression of instantaneity.
    setConversation(conversation);

    // We start the push before creating the message to optimize for instantaneity as well.
    void router.push(`/w/${owner.sId}/assistant/${conversation.sId}`);
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      isWideMode={conversation ? true : false}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistant"
      titleChildren={
        conversation && (
          <ConversationTitle
            title={conversation.title || ""}
            shareLink={`${baseUrl}/w/${owner.sId}/assistant/${conversation.sId}`}
          />
        )
      }
      navChildren={<AssistantSidebarMenu owner={owner} />}
    >
      {!conversation ? (
        <>
          <PageHeader
            title="Welcome to Assistant"
            icon={ChatBubbleBottomCenterTextIcon}
          />

          {/* GETTING STARTED */}
          <div className="flex flex-col gap-8 pb-32">
            <div className="mt-6 flex flex-col gap-2">
              <div className="flex flex-row gap-2">
                <Icon visual={FlagIcon} size="md" />
                <span className="text-lg font-bold">Getting started?</span>
              </div>
              <p className="text-element-700">
                Using Assistants is easy as asking a question to a friend or a
                coworker.
                <br />
                Try it out:
              </p>
              <div>
                <StartHelperConversationButton
                  content="Hey @helper, how can I interact with an Assistant?"
                  handleSubmit={handleSubmit}
                  variant="primary"
                />
              </div>
            </div>

            {/* FEATURED AGENTS */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-row gap-2">
                <Icon visual={HandRaisedIcon} size="md" />
                <span className="text-lg font-bold">
                  Meet your smart friends
                </span>
              </div>
              <p className="text-element-700">
                Dust is not just a single Assistant, it’s a full team at your
                service.
                <br />
                Each member has a set of specific set skills.
              </p>
              <p className="text-element-700">
                Meet some of your Assistants team:
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {agents.map((agent) => (
                  <div key={agent.sId} className="flex flex-col gap-1">
                    <Avatar
                      visual={<img src={agent.pictureUrl} alt="Agent Avatar" />}
                      size="md"
                    />
                    <div>
                      <div className="text-md font-bold text-element-900">
                        @{agent.name}
                      </div>
                      <div className="text-sm text-element-700">
                        {agent.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 sm:flex-row">
              <Button
                variant="tertiary"
                icon={showAllAgents ? ArrowUpCircleIcon : ArrowDownCircleIcon}
                label={
                  showAllAgents ? "Hide All Assistants" : "See all Assistants"
                }
                onClick={() => {
                  setShowAllAgents(!showAllAgents);
                }}
              />
              {isBuilder && (
                <>
                  <Button
                    variant="secondary"
                    icon={Cog6ToothIcon}
                    label="Manage Assistants"
                    onClick={() => {
                      void router.push(`/w/${owner.sId}/builder/assistants`);
                    }}
                  />
                  <Button
                    variant="primary"
                    icon={PlusCircleIcon}
                    label="Create a new Assistant"
                    onClick={() => {
                      void router.push(
                        `/w/${owner.sId}/builder/assistants/new`
                      );
                    }}
                  />
                </>
              )}
            </div>

            {/* FAQ */}
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex flex-row gap-2">
                <Icon visual={QuestionMarkCircleStrokeIcon} size="md" />
                <span className="text-lg font-bold">
                  Frequently asked questions
                </span>
              </div>

              {isBuilder ? (
                <div className="flex flex-wrap gap-2">
                  <StartHelperConversationButton
                    content="@helper, what can I use the Assistants for?"
                    handleSubmit={handleSubmit}
                  />
                  <StartHelperConversationButton
                    content="@helper, what are custom Assistants?"
                    handleSubmit={handleSubmit}
                  />
                  <StartHelperConversationButton
                    content="@helper, what customized Assistants should I create?"
                    handleSubmit={handleSubmit}
                  />
                  <StartHelperConversationButton
                    content="@helper, how can I make Assistant smarter with my own data?"
                    handleSubmit={handleSubmit}
                  />
                  <StartHelperConversationButton
                    content="@helper, what's the level of security and privacy dust offers?"
                    handleSubmit={handleSubmit}
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <StartHelperConversationButton
                    content="Hey @helper, What can I use an Assistant for?"
                    handleSubmit={handleSubmit}
                  />
                  <StartHelperConversationButton
                    content="@helper, who creates Assistants?"
                    handleSubmit={handleSubmit}
                  />
                  <StartHelperConversationButton
                    content="@helper, how do Assistants work exactly?"
                    handleSubmit={handleSubmit}
                  />
                  <StartHelperConversationButton
                    content="@helper, what are the limitations of Assistants?"
                    handleSubmit={handleSubmit}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <Conversation
          owner={owner}
          conversationId={conversation.sId}
          onTitleUpdate={() => {
            // Nothing to do as this new page will be long gone by the time the title is updated.
          }}
        />
      )}

      <FixedAssistantInputBar owner={owner} onSubmit={handleSubmit} />
    </AppLayout>
  );
}

function StartHelperConversationButton({
  content,
  handleSubmit,
  variant = "secondary",
}: {
  content: string;
  handleSubmit: (input: string, mentions: MentionType[]) => Promise<void>;
  variant?: "primary" | "secondary";
}) {
  const contentWithMarkdownMention = content.replace(
    "@helper",
    ":mention[helper]{sId=helper}"
  );

  return (
    <Button
      variant={variant}
      icon={ChatBubbleBottomCenterTextIcon}
      label={content}
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
