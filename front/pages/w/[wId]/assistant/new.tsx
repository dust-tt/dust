import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  Logo,
  PageHeader,
  RobotIcon,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import Conversation from "@app/components/assistant/conversation/Conversation";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/InputBar";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationLab } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { PostConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
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

export function AssistantHelper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-16 rounded-xl border border-structure-200 bg-structure-50 px-8 pb-8 pt-4 drop-shadow-2xl">
      {children}
    </div>
  );
}

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

  const handleSubmit = async (input: string, mentions: MentionType[]) => {
    // Create new conversation.
    const cRes = await fetch(`/api/w/${owner.sId}/assistant/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: null,
        visibility: "unlisted",
      }),
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

    // Create a new user message.
    const mRes = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: input,
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            profilePictureUrl: user.image,
          },
          mentions,
        }),
      }
    );

    if (!mRes.ok) {
      const data = await mRes.json();
      window.alert(`Error creating message: ${data.error.message}`);
      return;
    }
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      isWideMode={conversation ? true : false}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="lab"
      subNavigation={subNavigationLab({ owner, current: "assistant" })}
      titleChildren={
        conversation && (
          <ConversationTitle
            title={conversation.title || ""}
            shareLink={`${baseUrl}/w/${owner.sId}/assistant/${conversation.sId}`}
            // onDelete={() => {}}
            onUpdateVisibility={() => {
              return;
            }}
            visibility={"unlisted"}
          />
        )
      }
    >
      {!conversation ? (
        <>
          <PageHeader
            title="Welcome to Assistant"
            icon={ChatBubbleBottomCenterTextIcon}
          />
          <AssistantHelper>
            <div className="mb-8 text-lg font-bold">
              Get started with{" "}
              <Logo className="inline-block w-14 pb-0.5 pl-1"></Logo>
            </div>
            <p className="my-4 text-sm text-element-800">
              Lorem ispum dolor sit amet, consectetur adipiscing elit. You have
              access to multiple assistants, each with their own set of skills.
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </p>
            <p className="my-4 text-sm text-element-800">
              Assistants you have access to:{" "}
              <span className="font-bold italic">@gpt3.5-turbo</span>, and{" "}
              <span className="font-bold italic">@claude-instant</span>.
            </p>
            {["admin", "builder"].includes(owner.role) && (
              <div className="pt-4 text-center">
                <Button
                  variant={"primary"}
                  icon={RobotIcon}
                  label="Configure new Custom Assistants"
                  onClick={() => {
                    void router.push(`/w/${owner.sId}/builder/assistants`);
                  }}
                />
              </div>
            )}
          </AssistantHelper>
        </>
      ) : (
        <Conversation owner={owner} conversationId={conversation.sId} />
      )}

      <FixedAssistantInputBar owner={owner} onSubmit={handleSubmit} />
    </AppLayout>
  );
}
