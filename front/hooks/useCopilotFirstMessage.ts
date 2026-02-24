import { clientFetch } from "@app/lib/egress/client";
import type { TemplateInfo } from "@app/types/assistant/templates";
import type { WorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";

const COPILOT_USE_CASES = [
  "new",
  "existing",
  "template",
  "shrink-wrap",
] as const;
type CopilotUseCase = (typeof COPILOT_USE_CASES)[number];

function getCopilotScenario({
  workspaceSId,
  isNewAgent,
  templateInfo,
  conversationId,
  agentConfigurationId,
}: {
  workspaceSId: string;
  isNewAgent: boolean;
  templateInfo?: TemplateInfo;
  conversationId?: string;
  agentConfigurationId?: string;
}): {
  endpoint: string;
  useCase: CopilotUseCase;
} {
  if (templateInfo && templateInfo.copilotInstructions) {
    return {
      endpoint: `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/template?templateId=${templateInfo.templateId}`,
      useCase: "template",
    };
  }
  if (!isNewAgent && agentConfigurationId) {
    return {
      endpoint: `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/existing?agentConfigurationId=${agentConfigurationId}`,
      useCase: "existing",
    };
  }
  if (conversationId) {
    return {
      endpoint: `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/shrink-wrap?conversationId=${conversationId}`,
      useCase: "shrink-wrap",
    };
  }
  return {
    endpoint: `/api/w/${workspaceSId}/assistant/builder/copilot/prompt/new`,
    useCase: "new",
  };
}

export function useCopilotFirstMessage({
  owner,
  isNewAgent,
  templateInfo,
  conversationId,
  agentConfigurationId,
}: {
  owner: WorkspaceType;
  isNewAgent: boolean;
  templateInfo?: TemplateInfo;
  conversationId?: string;
  agentConfigurationId?: string;
}) {
  const { endpoint, useCase } = useMemo(
    () =>
      getCopilotScenario({
        workspaceSId: owner.sId,
        isNewAgent,
        templateInfo,
        conversationId,
        agentConfigurationId,
      }),
    [owner.sId, isNewAgent, templateInfo, conversationId, agentConfigurationId]
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

  return { getFirstMessage, useCase };
}
