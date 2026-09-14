import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UsePokeRenderConversationProps {
  owner: LightWorkspaceType;
  conversationId: string;
}

export function usePokeRenderConversation({
  owner,
  conversationId,
}: UsePokeRenderConversationProps) {
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<null | {
    tokensUsed: number;
    modelContextSizeUsed: number;
    modelIdUsed: string;
    modelConversation: unknown;
    promptTokenCountApprox: number;
    systemPrompt: string;
    toolsTokenCountApprox: number;
  }>(null);

  async function renderConversation(
    selectedAgentId: string,
    contextSizeOverride: string
  ) {
    if (!selectedAgentId) {
      setRenderError("Select an agent sId first.");
      return;
    }
    setIsRendering(true);
    setRenderError(null);
    setRenderResult(null);
    try {
      const response = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/conversations/${conversationId}/render`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: selectedAgentId,
            contextSizeOverride: contextSizeOverride
              ? Number(contextSizeOverride)
              : null,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        setRenderError(data.error?.message || "Failed to render conversation");
        return;
      }
      setRenderResult({
        tokensUsed: data.tokensUsed,
        modelContextSizeUsed: data.modelContextSizeUsed,
        modelIdUsed: data.modelIdUsed,
        modelConversation: data.modelConversation,
        promptTokenCountApprox: data.promptTokenCountApprox,
        systemPrompt: data.systemPrompt,
        toolsTokenCountApprox: data.toolsTokenCountApprox,
      });
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsRendering(false);
    }
  }

  function clearRenderResult() {
    setRenderError(null);
    setRenderResult(null);
  }

  return {
    isRendering,
    renderError,
    renderResult,
    renderConversation,
    clearRenderResult,
  };
}
