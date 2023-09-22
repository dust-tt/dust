import {
  ArrowDownCircleIcon,
  Avatar,
  Button,
  ChatBubbleBottomCenterTextIcon,
  Icon,
  PageHeader,
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
      owner,
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AssistantNew({
  user,
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
  const customOrder = [
    "Dust",
    "gpt4",
    "slack",
    "notion",
    "googledrive",
    "github",
    "claude",
  ];
  // Sort agents based on custom criteria
  agents.sort((a, b) => {
    // Check for 'Dust'
    if (a.name === "Dust") return -1;
    if (b.name === "Dust") return 1;

    // Check for 'gpt4'
    if (a.name === "gpt-4") return -1;
    if (b.name === "gpt4") return 1;

    // Check for agents with 'scope' set to 'workspace'
    if (a.scope === "workspace" && b.scope !== "workspace") return -1;
    if (b.scope === "workspace" && a.scope !== "workspace") return 1;

    // Check for customOrder (slack, notion, googledrive, github, claude)
    const aIndex = customOrder.indexOf(a.name);
    const bIndex = customOrder.indexOf(b.name);

    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex; // Both are in customOrder, sort them accordingly
    }

    if (aIndex !== -1) return -1; // Only a is in customOrder, it comes first
    if (bIndex !== -1) return 1; // Only b is in customOrder, it comes first

    return 0; // Default: keep the original order
  });

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
      topNavigationCurrent="assistant_v2"
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
                Using assistant is easy as asking a question to a friend or a
                coworker.
                <br />
                Try it out:
              </p>
              <div>
                <StartHelperConversationButton
                  content="Hey @helper, how do I use the assistant?"
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
                Dust is not just a single assistant, it’s a full team at your
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
              <StartHelperConversationButton
                content="Hey @helper, how do I use the assistant?"
                handleSubmit={handleSubmit}
              />
            </div>

            {/* FAQ */}
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex flex-row gap-2">
                <Icon visual={QuestionMarkCircleStrokeIcon} size="md" />
                <span className="text-lg font-bold">
                  Frequently asked questions
                </span>
              </div>
              <div className="flex flex-col items-start gap-2 sm:flex-row">
                <StartHelperConversationButton
                  content="@helper, what can I use the Assistant for?"
                  handleSubmit={handleSubmit}
                />
                <StartHelperConversationButton
                  content="@helper, what are the limitations of the Assistant?"
                  handleSubmit={handleSubmit}
                />
              </div>
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
