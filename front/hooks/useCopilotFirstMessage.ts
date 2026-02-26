import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { TemplateInfo } from "@app/types/assistant/templates";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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
  workspaceId,
  isNewAgent,
  templateInfo,
  conversationId,
  agentConfigurationId,
  copilotEdge,
}: {
  workspaceId: string;
  isNewAgent: boolean;
  templateInfo?: TemplateInfo;
  conversationId?: string;
  agentConfigurationId?: string;
  copilotEdge: boolean;
}): {
  endpoint: string;
  useCase: CopilotUseCase;
} {
  const params = new URLSearchParams();
  let useCase: CopilotUseCase;

  if (templateInfo && templateInfo.copilotInstructions) {
    useCase = "template";
    params.set("templateId", templateInfo.templateId);
  } else if (!isNewAgent && agentConfigurationId) {
    useCase = "existing";
    params.set("agentConfigurationId", agentConfigurationId);
  } else if (conversationId) {
    useCase = "shrink-wrap";
    params.set("conversationId", conversationId);
  } else {
    useCase = "new";
  }

  if (copilotEdge) {
    params.set("copilotEdge", "true");
  }

  const queryString = params.toString();
  const path = `/api/w/${workspaceId}/assistant/builder/copilot/prompt/${useCase}`;
  return {
    endpoint: queryString ? `${path}?${queryString}` : path,
    useCase,
  };
}

export function useCopilotFirstMessage({
  owner,
  isNewAgent,
  templateInfo,
  conversationId,
  agentConfigurationId,
  copilotEdge = false,
}: {
  owner: WorkspaceType;
  isNewAgent: boolean;
  templateInfo?: TemplateInfo;
  conversationId?: string;
  agentConfigurationId?: string;
  copilotEdge?: boolean;
}) {
  const { endpoint, useCase } = useMemo(
    () =>
      getCopilotScenario({
        workspaceId: owner.sId,
        isNewAgent,
        templateInfo,
        conversationId,
        agentConfigurationId,
        copilotEdge,
      }),
    [
      owner.sId,
      isNewAgent,
      templateInfo,
      conversationId,
      agentConfigurationId,
      copilotEdge,
    ]
  );

  const getFirstMessage = useCallback(async (): Promise<
    Result<string, Error>
  > => {
    try {
      const res = await clientFetch(endpoint, {
        method: "GET",
      });

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        return new Err(new Error(errorData.message));
      }

      const data = await res.json();
      return new Ok(data);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }, [endpoint]);

  return { getFirstMessage, useCase };
}
