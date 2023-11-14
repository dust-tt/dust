import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";

import Conversation from "@app/components/assistant/conversation/Conversation";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/InputBar";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useConversation } from "@app/lib/swr";
import { LimitReachedPopup } from "@app/pages/w/[wId]/assistant/new";
import { AgentMention, MentionType } from "@app/types/assistant/conversation";
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
        destination: `/w/${context.query.wId}/join?cId=${context.query.cId}`,
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
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);
  const [planLimitReached, setPlanLimitReached] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  useEffect(() => {
    function handleNewConvoShortcut(event: KeyboardEvent) {
      // Check for Command on Mac or Ctrl on others
      const isModifier = event.metaKey || event.ctrlKey;
      if (isModifier && event.key === "/") {
        void router.push(`/w/${owner.sId}/assistant/new`);
      }
    }

    window.addEventListener("keydown", handleNewConvoShortcut);
    return () => {
      window.removeEventListener("keydown", handleNewConvoShortcut);
    };
  }, [owner.sId, router]);

  const { conversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
  });
  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragment?: {
      title: string;
      content: string;
    }
  ) => {
    // Create a new content fragment.
    if (contentFragment) {
      const mcfRes = await fetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: contentFragment.title,
            content: contentFragment.content,
            url: null,
            contentType: "file_attachment",
            context: {
              timezone:
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              profilePictureUrl: user.image,
            },
          }),
        }
      );

      if (!mcfRes.ok) {
        const data = await mcfRes.json();
        console.error("Error creating content fragment", data);
        sendNotification({
          title: "Error uploading file.",
          description: data.error.message || "Please try again or contact us.",
          type: "error",
        });
        return;
      }
    }

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
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            profilePictureUrl: user.image,
          },
          mentions,
        }),
      }
    );

    if (!mRes.ok) {
      const data = await mRes.json();
      if (data.error.type === "test_plan_message_limit_reached") {
        setPlanLimitReached(true);
      } else {
        sendNotification({
          title: "Your message could not be sent",
          description: data.error.message || "Please try again or contact us.",
          type: "error",
        });
      }
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
    <GenerationContextProvider>
      <AppLayout
        user={user}
        owner={owner}
        isWideMode={true}
        pageTitle={
          conversation?.title
            ? `Dust - ${conversation?.title}`
            : `Dust - New Conversation`
        }
        gaTrackingId={gaTrackingId}
        topNavigationCurrent="assistant"
        titleChildren={
          conversation && (
            <ConversationTitle
              owner={owner}
              conversation={conversation}
              shareLink={`${baseUrl}/w/${owner.sId}/assistant/${conversationId}`}
              onDelete={() => {
                void handdleDeleteConversation();
              }}
            />
          )
        }
        navChildren={
          <AssistantSidebarMenu owner={owner} triggerInputAnimation={null} />
        }
      >
        <Conversation
          owner={owner}
          user={user}
          conversationId={conversationId}
          onStickyMentionsChange={setStickyMentions}
        />
        <FixedAssistantInputBar
          owner={owner}
          onSubmit={handleSubmit}
          stickyMentions={stickyMentions}
          conversationId={conversationId}
        />
        <LimitReachedPopup
          planLimitReached={planLimitReached}
          workspaceId={owner.sId}
        />
      </AppLayout>
    </GenerationContextProvider>
  );
}
