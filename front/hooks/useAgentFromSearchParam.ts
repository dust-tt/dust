import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useSearchParam } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import { useContext, useEffect, useRef } from "react";

/**
 * Reads the ?agent= search param, fetches the corresponding agent configuration, and
 * sets it as the selected agent in the input bar. The param stays in the URL so the
 * link remains shareable, and is applied once per agent id so a later manual agent
 * change is not overridden when the configuration revalidates.
 */
export function useAgentFromSearchParam(workspaceId: string) {
  const agent = useSearchParam("agent");
  const { setSelectedAgent } = useContext(InputBarContext);
  const appliedAgentIdRef = useRef<string | null>(null);

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId,
    agentConfigurationId: agent,
    disabled: !agent,
  });

  useEffect(() => {
    if (
      !agentConfiguration ||
      appliedAgentIdRef.current === agentConfiguration.sId
    ) {
      return;
    }

    appliedAgentIdRef.current = agentConfiguration.sId;
    setSelectedAgent(toRichAgentMentionType(agentConfiguration));
  }, [agentConfiguration, setSelectedAgent]);
}
