import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { AgentMention, MentionType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";

import Conversation from "@app/components/assistant/conversation/Conversation";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import {
  deleteConversation,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationConversations } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useConversation } from "@app/lib/swr";
import { LimitReachedPopup } from "@app/pages/w/[wId]/assistant/new";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
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
  const subscription = auth.subscription();
  if (!owner || !auth.isUser() || !user || !subscription) {
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
      subscription,
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
      conversationId: context.params?.cId as string,
    },
  };
};

export default function AssistantConversation({
  user,
  owner,
  subscription,
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
    const messageData = { input, mentions, contentFragment };
    const result = await submitMessage({
      owner,
      user,
      conversationId,
      messageData,
    });
    if (result.isOk()) return;
    if (result.error.type === "plan_limit_reached_error") {
      setPlanLimitReached(true);
    } else {
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });
    }
  };

  return (
    <GenerationContextProvider>
      <AppLayout
        subscription={subscription}
        user={user}
        owner={owner}
        isWideMode={true}
        pageTitle={
          conversation?.title
            ? `Dust - ${conversation?.title}`
            : `Dust - New Conversation`
        }
        gaTrackingId={gaTrackingId}
        topNavigationCurrent="conversations"
        subNavigation={subNavigationConversations({
          owner,
          current: "conversation",
        })}
        titleChildren={
          conversation && (
            <ConversationTitle
              owner={owner}
              conversation={conversation}
              shareLink={`${baseUrl}/w/${owner.sId}/assistant/${conversationId}`}
              onDelete={async () => {
                await deleteConversation({
                  workspaceId: owner.sId,
                  conversationId,
                  sendNotification,
                });
                void router.push(`/w/${owner.sId}/assistant/new`);
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
