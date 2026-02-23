import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useOnboardingConversation } from "@app/hooks/useOnboardingConversation";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import { useContext, useEffect, useState } from "react";

export function ConversationPage() {
  const [conversationKey, setConversationKey] = useState<string | null>(null);
  const router = useAppRouter();
  const owner = useWorkspace();
  const { subscription, user } = useAuth();

  const activeConversationId = useActiveConversationId();

  // Redirect old ?assistant= query param to ?agent=
  const assistant = useSearchParam("assistant");
  const agent = useSearchParam("agent");
  useEffect(() => {
    if (assistant && !agent) {
      const params = new URLSearchParams(window.location.search);
      params.delete("assistant");
      params.set("agent", assistant);

      const conversationId = activeConversationId ?? "new";
      void router.replace(
        `/w/${owner.sId}/conversation/${conversationId}?${params.toString()}`
      );
    }
  }, [assistant, agent, activeConversationId, owner.sId, router]);

  // Handle onboarding conversation creation when ?welcome=true
  useOnboardingConversation({
    workspaceId: owner.sId,
    conversationId: activeConversationId,
  });

  const { setSelectedAgent } = useContext(InputBarContext);

  const { agentConfiguration: selectedAgentConfiguration } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agent,
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
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
