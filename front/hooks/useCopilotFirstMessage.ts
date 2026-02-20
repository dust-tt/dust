import { clientFetch } from "@app/lib/egress/client";
import type { TemplateInfo } from "@app/types/assistant/templates";
import type { WorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";

function getEndpoint({
  workspaceSId,
  isNewAgent,
  templateInfo,
  conversationId,
}: {
  workspaceSId: string;
  isNewAgent: boolean;
  templateInfo?: TemplateInfo;
  conversationId?: string;
}): string {
  if (templateInfo && templateInfo.copilotInstructions) {
    return `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/template?templateId=${templateInfo.templateId}`;
  }
  if (!isNewAgent) {
    // TODO(copilot): send actual agent id
    return `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/existing`;
  }
  if (conversationId) {
    return `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/shrink-wrap?conversationId=${conversationId}`;
  }
  return `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/new`;
}

export function useCopilotFirstMessage({
  owner,
  isNewAgent,
  templateInfo,
  conversationId,
}: {
  owner: WorkspaceType;
  isNewAgent: boolean;
  templateInfo?: TemplateInfo;
  conversationId?: string;
}) {
  const endpoint = useMemo(
    () =>
      getEndpoint({
        workspaceSId: owner.sId,
        isNewAgent,
        templateInfo,
        conversationId,
      }),
    [owner.sId, isNewAgent, templateInfo, conversationId]
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
