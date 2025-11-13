import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useEffect, useRef, useState } from "react";

import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useConversations } from "@app/lib/swr/conversations";
import { useMembers } from "@app/lib/swr/memberships";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { setUserMetadataFromClient } from "@app/lib/user";
import type { MentionType } from "@app/types";
import { GLOBAL_AGENTS_SID, isString } from "@app/types";

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

  // Redirect old ?assistant= query param to ?agent=
  const { assistant, agent, wId, ...restQuery } = context.query;
  if (isString(assistant) && !isString(agent)) {
    const params = new URLSearchParams();
    Object.entries(restQuery).forEach(([key, value]) => {
      if (isString(value)) {
        params.set(key, value);
      }
    });
    params.set("agent", assistant);

    const conversationId =
      typeof context.params?.cId === "string" ? context.params.cId : "new";

    return {
      redirect: {
        destination: `/w/${wId}/conversation/${conversationId}?${params.toString()}`,
        permanent: true,
      },
    };
  }

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

  const { setSelectedAgent } = useContext(InputBarContext);

  const { agent } = router.query;

  // Onboarding Chat auto-creation when flag is enabled and workspace is brand-new.
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const isOnboardingEnabled = featureFlags.includes("growth_onboarding_chat");
  const { total: membersTotal, isMembersLoading } = useMembers({
    workspaceId: owner.sId,
  });
  const { conversations, isConversationsLoading } = useConversations({
    workspaceId: owner.sId,
  });
  const creationStartedRef = useRef(false);

  // Keep the conversation view state in sync and preselect agent from ?agent.
  // Also handles resetting the ConversationContainer key when switching conversations.
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
      setSelectedAgent({ configurationId: agentId });
    } else {
      setSelectedAgent(null);
    }
  }, [
    agent,
    setConversationKey,
    initialConversationId,
    activeConversationId,
    setSelectedAgent,
  ]);

  // Auto-create onboarding chat on first visit when:
  // - feature flag is enabled, and
  // - URL has ?welcome=true, and
  // - workspace looks brand-new (<=1 member, 0 conversations).
  useEffect(() => {
    const shouldCreate =
      isOnboardingEnabled &&
      router.query.welcome === "true" &&
      !activeConversationId &&
      !isMembersLoading &&
      !isConversationsLoading &&
      (membersTotal ?? 0) <= 1 &&
      (conversations?.length ?? 0) === 0 &&
      !creationStartedRef.current;

    if (!shouldCreate) {
      return;
    }

    creationStartedRef.current = true;

    // Creates the onboarding conversation and redirects the user to it.
    const createOnboardingConversation = async () => {
      const res = await createConversationWithMessage({
        owner,
        user,
        messageData: {
          input: "",
          mentions: [
            { configurationId: GLOBAL_AGENTS_SID.DUST } as MentionType,
          ],
          contentFragments: { uploaded: [], contentNodes: [] },
          origin: "onboarding_conversation",
        },
        visibility: "unlisted",
      });
      if (res.isErr()) {
        // Fall back silently to the page as-is.
        creationStartedRef.current = false;
        return;
      }

      const newConversation = res.value;
      // Persist onboarding conversation id in user metadata.

      await setUserMetadataFromClient({
        key: "onboarding:conversation",
        value: newConversation.sId,
      });

      // Navigate to the new conversation and drop the welcome param.
      void router.replace(
        `/w/${owner.sId}/conversation/${newConversation.sId}`,
        undefined,
        { shallow: true }
      );
    };

    void createOnboardingConversation();
  }, [
    isOnboardingEnabled,
    router.query.welcome,
    activeConversationId,
    isMembersLoading,
    isConversationsLoading,
    membersTotal,
    conversations,
    owner.sId,
    router,
    owner,
    user,
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
      <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>
    </AppRootLayout>
  );
};

function getValidConversationId(cId: unknown) {
  return typeof cId === "string" && cId !== "new" ? cId : null;
}
