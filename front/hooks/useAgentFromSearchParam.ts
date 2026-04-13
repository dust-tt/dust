import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useSearchParam } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import { useContext, useEffect } from "react";

/**
 * Reads the ?agent= search param, fetches the corresponding agent configuration,
 * sets it as the selected agent in the input bar, and cleans up the param from the
 * URL so it doesn't persist across manual agent changes or page refreshes.
 */
export function useAgentFromSearchParam(workspaceId: string) {
  const agent = useSearchParam("agent");
  const { setSelectedAgent } = useContext(InputBarContext);

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId,
    agentConfigurationId: agent,
    disabled: !agent,
  });

  useEffect(() => {
    if (!agentConfiguration) {
      return;
    }

    setSelectedAgent(toRichAgentMentionType(agentConfiguration));

    const params = new URLSearchParams(window.location.search);
    if (params.has("agent")) {
      params.delete("agent");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`
      );
    }
  }, [agentConfiguration, setSelectedAgent]);
}
