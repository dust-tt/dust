import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import { useContext, useEffect, useRef } from "react";

/**
 * Keeps the ?agent= search param and the input bar's selected agent in sync on the new
 * conversation page so the URL can always be shared. The param wins on arrival, the
 * picker wins afterwards.
 */
export function useAgentFromSearchParam(workspaceId: string) {
  const router = useAppRouter();
  const agent = useSearchParam("agent");
  const activeConversationId = useActiveConversationId();
  const { selectedSingleAgent, setSelectedAgent } = useContext(InputBarContext);
  const syncedParamRef = useRef<string | null>(null);

  const isSynced = !!agent && selectedSingleAgent?.id === agent;

  const { agentConfiguration, isAgentConfigurationError } =
    useAgentConfiguration({
      workspaceId,
      agentConfigurationId: agent,
      disabled: !agent || isSynced,
    });

  // URL to composer. When url param "agent" names an agent other than the selected one, fetch it
  // and select it. syncedParamRef tracks the last param the selection has matched, so a
  // param that is still being applied is not mistaken for a picker change by the effect
  // below.
  useEffect(() => {
    if (!agent || !agentConfiguration || syncedParamRef.current === agent) {
      return;
    }

    setSelectedAgent(toRichAgentMentionType(agentConfiguration));
  }, [agent, agentConfiguration, setSelectedAgent]);

  // Composer to URL. On a new conversation, once the URL agent has been applied, a picker
  // change is mirrored into the url param "agent" so the address bar always reflects the selected agent.
  useEffect(() => {
    if (isSynced) {
      syncedParamRef.current = agent;
    }

    const isNewConversation = activeConversationId === null;
    const isUrlAgentNotFound =
      isAgentConfigurationError?.error?.type ===
      "agent_configuration_not_found";
    const isUrlAgentPending =
      !!agent && syncedParamRef.current !== agent && !isUrlAgentNotFound;

    if (
      isSynced ||
      !isNewConversation ||
      !selectedSingleAgent ||
      isUrlAgentPending
    ) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("agent", selectedSingleAgent.id);
    void router.replace(
      `${window.location.pathname}?${params.toString()}${window.location.hash}`
    );
  }, [
    activeConversationId,
    agent,
    isAgentConfigurationError,
    isSynced,
    router,
    selectedSingleAgent,
  ]);
}
