import type { ReactElement } from "react";
import { useContext, useEffect, useState } from "react";

import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useOnboardingConversation } from "@app/hooks/useOnboardingConversation";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { isString, toRichAgentMentionType } from "@app/types";

export const getServerSideProps =
  withDefaultUserAuthRequirements<AuthContextValue>(async (context, auth) => {
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

    return {
      props: {
        workspace: auth.getNonNullableWorkspace(),
        subscription: auth.getNonNullableSubscription(),
        user: auth.getNonNullableUser().toJSON(),
        isAdmin: auth.isAdmin(),
        isBuilder: auth.isBuilder(),
        isSuperUser: false,
      },
    };
  });

function AgentConversation() {
  const [conversationKey, setConversationKey] = useState<string | null>(null);
  const router = useAppRouter();
  const owner = useWorkspace();
  const { subscription, user } = useAuth();

  const activeConversationId = useActiveConversationId();

  // Handle onboarding conversation creation when ?welcome=true
  useOnboardingConversation({
    workspaceId: owner.sId,
    conversationId: activeConversationId,
  });

  const { setSelectedAgent } = useContext(InputBarContext);

  const { agent } = router.query;

  const { agentConfiguration: selectedAgentConfiguration } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agent && isString(agent) ? agent : null,
    });

  useEffect(() => {
    if (selectedAgentConfiguration) {
      setSelectedAgent(toRichAgentMentionType(selectedAgentConfiguration));
    }
  }, [selectedAgentConfiguration, setSelectedAgent]);

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
  }, [setConversationKey, activeConversationId]);

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

const PageWithAuthLayout = AgentConversation as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>
      <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>
    </AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
