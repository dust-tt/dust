import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { ConversationContainer } from "@app/components/assistant/conversation/ConversationContainer";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import ConversationLayout from "@app/components/assistant/conversation/ConversationLayout";
import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<
  ConversationLayoutProps & {
    // Here, override conversationId.
    conversationId: string | null;
  }
>(async (context, auth) => {
  const owner = auth.workspace();
  const user = auth.user()?.toJSON();
  const subscription = auth.subscription();

  if (!owner || !user || !auth.isUser() || !subscription) {
    const { cId } = context.query;

    if (typeof cId === "string") {
      return {
        redirect: {
          destination: `/w/${context.query.wId}/join?cId=${cId}`,
          permanent: false,
        },
      };
    }

    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const { cId } = context.params;

  return {
    props: {
      user,
      owner,
      subscription,
      baseUrl: config.getClientFacingUrl(),
      conversationId: getValidConversationId(cId),
    },
  };
});

export default function AssistantConversation({
  conversationId: initialConversationId,
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [conversationKey, setConversationKey] = useState<string | null>(null);
  const [agentIdToMention, setAgentIdToMention] = useState<string | null>(null);
  const router = useRouter();

  const { activeConversationId } = useConversationsNavigation();

  const { assistant } = router.query;

  // This useEffect handles whether to change the key of the ConversationContainer
  // or not. Altering the key forces a re-render of the component. A random number
  // is used in the key to maintain the component during the transition from new
  // to the conversation view. The key is reset when navigating to a new conversation.
  useEffect(() => {
    if (activeConversationId) {
      // Set conversation id as key if it exists.
      setConversationKey(activeConversationId);
    } else if (!activeConversationId) {
      // Force re-render by setting a new key with a random number.
      setConversationKey(`new_${Math.random() * 1000}`);

      // Scroll to the top of the conversation container when clicking on "new".
      const mainTag = document.getElementById(
        CONVERSATION_PARENT_SCROLL_DIV_ID["page"]
      );

      if (mainTag) {
        mainTag.scrollTo(0, 0);
      }
    }

    const agentId = assistant ?? null;
    if (agentId && typeof agentId === "string") {
      setAgentIdToMention(agentId);
    } else {
      setAgentIdToMention(null);
    }
  }, [
    assistant,
    setConversationKey,
    initialConversationId,
    activeConversationId,
  ]);

  return (
    <ConversationContainer
      // Key ensures the component re-renders when conversation changes except for shallow browse.
      key={conversationKey}
      owner={owner}
      subscription={subscription}
      user={user}
      agentIdToMention={agentIdToMention}
    />
  );
}

AssistantConversation.getLayout = (
  page: React.ReactElement,
  pageProps: any
) => {
  return (
    <AppRootLayout>
      <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>
    </AppRootLayout>
  );
};

function getValidConversationId(cId: unknown) {
  return typeof cId === "string" && cId !== "new" ? cId : null;
}
