import type { UserType } from "@dust-tt/types";
import type { AgentMention, MentionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useContext, useEffect, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import Conversation from "@app/components/assistant/conversation/Conversation";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import ConversationLayout from "@app/components/assistant/conversation/ConversationLayout";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { submitMessage } from "@app/components/assistant/conversation/lib";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { LimitReachedPopup } from "@app/pages/w/[wId]/assistant/new";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<
  ConversationLayoutProps & {
    // Here, override conversationId.
    conversationId: string;
    user: UserType;
  }
>(async (context, auth) => {
  const owner = auth.workspace();
  const user = auth.user();
  const subscription = auth.subscription();

  if (!owner || !user || !auth.isUser() || !subscription) {
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
});

export default function AssistantConversation({
  conversationId,
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);
  const [planLimitReached, setPlanLimitReached] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);
  const [detailViewContent, setDetailViewContent] = useState("");

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

  const handleCloseModal = () => {
    const currentPathname = router.pathname;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { assistantDetails, ...restQuery } = router.query;
    void router.push(
      { pathname: currentPathname, query: restQuery },
      undefined,
      {
        shallow: true,
      }
    );
  };

  useEffect(() => {
    const handleRouteChange = () => {
      const assistantSId = router.query.assistantDetails ?? [];
      if (assistantSId && typeof assistantSId === "string") {
        setDetailViewContent(assistantSId);
      } else {
        setDetailViewContent("");
      }
    };

    // Initial check in case the component mounts with the query already set.
    handleRouteChange();

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.query, router.events]);

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
    <>
      <AssistantDetails
        owner={owner}
        assistantId={detailViewContent || null}
        onClose={handleCloseModal}
      />
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
        isOpened={planLimitReached}
        onClose={() => setPlanLimitReached(false)}
        subscription={subscription}
        workspaceId={owner.sId}
      />
    </>
  );
}

AssistantConversation.getLayout = (page: ReactElement, pageProps: any) => {
  return <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>;
};
