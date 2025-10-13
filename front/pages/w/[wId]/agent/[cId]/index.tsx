import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";

import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainerVirtuoso";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayoutVirtuoso";
import ConversationLayoutVirtuoso from "@app/components/assistant/conversation/ConversationLayoutVirtuoso";
import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
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
  const isAdmin = auth.isAdmin();

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
      isAdmin,
      subscription,
      baseUrl: config.getClientFacingUrl(),
      conversationId: getValidConversationId(cId),
    },
  };
});

export default function AgentConversation({
  conversationId: initialConversationId,
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [conversationKey, setConversationKey] = useState<string | null>(null);
  const router = useRouter();

  const { activeConversationId } = useConversationsNavigation();

  const { setSelectedAssistant } = useContext(InputBarContext);

  const { agent } = router.query;

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
    }

    const agentId = agent ?? null;
    if (agentId && typeof agentId === "string") {
      setSelectedAssistant({ configurationId: agentId });
    } else {
      setSelectedAssistant(null);
    }
  }, [
    agent,
    setConversationKey,
    initialConversationId,
    activeConversationId,
    setSelectedAssistant,
  ]);

  return (
    <ConversationContainerVirtuoso
      // Key ensures the component re-renders when conversation changes except for shallow browse.
      key={conversationKey}
      owner={owner}
      subscription={subscription}
      user={user}
    />
  );
}

AgentConversation.getLayout = (
  page: React.ReactElement,
  pageProps: ConversationLayoutProps
) => {
  return (
    <AppRootLayout>
      <ConversationLayoutVirtuoso pageProps={pageProps}>
        {page}
      </ConversationLayoutVirtuoso>
    </AppRootLayout>
  );
};

function getValidConversationId(cId: unknown) {
  return typeof cId === "string" && cId !== "new" ? cId : null;
}
