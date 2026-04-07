import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useOnboardingConversation } from "@app/hooks/useOnboardingConversation";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import { useContext, useEffect } from "react";

export function ConversationPage() {
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

  return (
    <ConversationContainerVirtuoso
      owner={owner}
      subscription={subscription}
      user={user}
    />
  );
}
