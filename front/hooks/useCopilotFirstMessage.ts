import { clientFetch } from "@app/lib/egress/client";
import type { WorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";

function getEndpoint({
  workspaceSId,
  isNewAgent,
  templateCopilotInstructions: _,
  conversationId,
}: {
  workspaceSId: string;
  isNewAgent: boolean;
  templateCopilotInstructions: string | null;
  conversationId?: string;
}): string {
  if (!isNewAgent) {
    // TODO: fill with actual agent id
    return `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/existing?agentId=${""}`;
  }

  if (conversationId) {
    return `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/shrink-wrap?conversationId=${conversationId}`;
  }

  return `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/new`;
}

export function useCopilotFirstMessage({
  owner,
  isNewAgent,
  templateCopilotInstructions,
  conversationId,
}: {
  owner: WorkspaceType;
  isNewAgent: boolean;
  templateCopilotInstructions: string | null;
  conversationId?: string;
}) {
  const endpoint = useMemo(
    () =>
      getEndpoint({
        workspaceSId: owner.sId,
        isNewAgent,
        templateCopilotInstructions,
        conversationId,
      }),
    [owner.sId, isNewAgent, templateCopilotInstructions, conversationId]
  );

  const getFirstMessage = useCallback(async (): Promise<string> => {
    const res = await clientFetch(endpoint, {
      method: "GET",
    });

    if (!res.ok) {
      throw new Error(
        `Failed to fetch copilot first message: ${res.status} ${res.statusText}`
      );
    }

    const data = (await res.json()) as string;
    return data;
  }, [endpoint]);

  return { getFirstMessage };
}
