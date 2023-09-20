import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import { mutate } from "swr";

import Conversation from "@app/components/assistant/conversation/Conversation";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/InputBar";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { MentionType } from "@app/types/assistant/conversation";
import { UserType, WorkspaceType } from "@app/types/user";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  gaTrackingId: string;
  baseUrl: string;
  conversationId: string;
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
      conversationId: context.params?.cId as string,
    },
  };
};

export default function AssistantConversation({
  user,
  owner,
  gaTrackingId,
  baseUrl,
  conversationId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [title, setTitle] = useState<string | null>(null);

  const handleSubmit = async (input: string, mentions: MentionType[]) => {
    // Create a new user message.
    const mRes = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages`,
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

  const handdleDeleteConversation = async () => {
    const res = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      const data = await res.json();
      window.alert(`Error deleting conversation: ${data.error.message}`);
      return;
    }

    await router.push(`/w/${owner.sId}/assistant/new`);
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      isWideMode={true}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistant_v2"
      titleChildren={
        <ConversationTitle
          title={title || ""}
          shareLink={`${baseUrl}/w/${owner.sId}/assistant/${conversationId}`}
          onDelete={() => {
            void handdleDeleteConversation();
          }}
        />
      }
      navChildren={<AssistantSidebarMenu owner={owner} />}
    >
      <Conversation
        owner={owner}
        conversationId={conversationId}
        onTitleUpdate={(title) => {
          setTitle(title);
          // We mutate the list of conversations so that the title gets updated.
          void mutate(`/api/w/${owner.sId}/assistant/conversations`);
        }}
      />
      <FixedAssistantInputBar owner={owner} onSubmit={handleSubmit} />
    </AppLayout>
  );
}
