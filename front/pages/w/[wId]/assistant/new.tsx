import {
  Avatar,
  Button,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Page,
  PlusIcon,
  WrenchIcon,
} from "@dust-tt/sparkle";
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

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  const displayedAgents = showAllAgents
    ? activeAgents
    : activeAgents.slice(0, 4);

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
        <div className="text-sm font-normal text-element-800">
          <Page.Vertical gap="md" align="left">
            <Page.Header
              title={"Welcome " + user.name.split(" ")[0] + "!"} //Not solid
              icon={ChatBubbleLeftRightIcon}
            />
            {/* GETTING STARTED */}
            <Page.Vertical gap="xs" align="left">
              <Page.SectionHeader title="Getting started?" />
              <Page.P variant="secondary">
                Interact with assistants on Dust like you would with a friend or
                coworker.
                <br />
                Try it for yourself:
              </Page.P>
              <StartHelperConversationButton
                content="Hey @helper, how can I interact with an Assistant?"
                handleSubmit={handleSubmit}
                variant="secondary"
              />
            </Page.Vertical>
            <Page.Separator />
            {/* FEATURED AGENTS */}
            <Page.Vertical gap="lg" align="left">
              <Page.Vertical gap="xs" align="left">
                <Page.SectionHeader title="Meet your team of assistants" />
                {isBuilder && (
                  <>
                    <Page.P variant="secondary">
                      Dust comes with multiple assistants, each with a specific
                      set of skills.
                      <br />
                      Create assistants tailored for your needs.
                    </Page.P>
                    {activeAgents.length <= 4 && (
                      <Page.P variant="secondary">
                        Meet your first assistants:
                      </Page.P>
                    )}
                    {activeAgents.length > 4 && (
                      <Page.P variant="secondary">
                        Meet your assistant team:
                      </Page.P>
                    )}
                  </>
                )}
                {!isBuilder && (
                  <>
                    <Page.P variant="secondary">
                      Dust is not just a single assistant, it’s a full team at
                      your service.
                      <br />
                      Each member has a set of specific set skills.
                    </Page.P>
                    <Page.P variant="secondary">
                      Meet some of your Assistants team:
                    </Page.P>
                  </>
                )}
              </Page.Vertical>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {displayedAgents.map((agent) => (
                    <AvatarListItem key={agent.sId} agent={agent} />
                  ))}
                </div>
              </div>
              <Button.List>
                {activeAgents.length > 4 && (
                  <Button
                    variant="primary"
                    icon={showAllAgents ? ChevronUpIcon : ChevronDownIcon}
                    size="xs"
                    label={
                      showAllAgents
                        ? "Hide All Assistants"
                        : "See all Assistants"
                    }
                    onClick={() => {
                      setShowAllAgents(!showAllAgents);
                    }}
                  />
                )}

                {isBuilder && (
                  <>
                    <Button
                      variant="primary"
                      icon={PlusIcon}
                      label="Create an assistant"
                      hasMagnifying={false}
                      size="xs"
                      onClick={() => {
                        void router.push(
                          `/w/${owner.sId}/builder/assistants/new`
                        );
                      }}
                    />
                    <Button
                      variant="secondary"
                      icon={WrenchIcon}
                      label="Manage Assistants"
                      hasMagnifying={false}
                      size="xs"
                      onClick={() => {
                        void router.push(`/w/${owner.sId}/builder/assistants`);
                      }}
                    />
                  </>
                )}
                <StartHelperConversationButton
                  content="Hey @helper, how can I use an assistant?"
                  handleSubmit={handleSubmit}
                />
              </Button.List>
            </Page.Vertical>
            <Page.Separator />
            {/* FAQ */}
            <Page.Vertical gap="xs" align="left">
              <Page.SectionHeader title="Frequently asked questions" />
              <Button.List className="flex-wrap">
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
              </Button.List>
            </Page.Vertical>
          </Page.Vertical>
        </div>
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
  size = "xs",
}: {
  content: string;
  handleSubmit: (input: string, mentions: MentionType[]) => Promise<void>;
  variant?: "primary" | "secondary";
  size?: "sm" | "xs";
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

const AvatarListItem = function ({
  agent,
}: {
  agent: { sId: string; pictureUrl: string; name: string; description: string };
}) {
  return (
    <div className="flex flex-col gap-2">
      <Avatar
        visual={<img src={agent.pictureUrl} alt="Agent Avatar" />}
        size="md"
      />
      <div className="flex flex-col gap-1">
        <div className="text-md font-bold text-element-900">@{agent.name}</div>
        <div className="text-sm text-element-700">{agent.description}</div>
      </div>
    </div>
  );
};
