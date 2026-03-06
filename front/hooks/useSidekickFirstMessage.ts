import { clientFetch } from "@app/lib/egress/client";
import type { TemplateInfo } from "@app/types/assistant/templates";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkspaceType } from "@app/types/user";
import { useMemo } from "react";

const COPILOT_USE_CASES = [
  "new",
  "existing",
  "duplicate",
  "template",
  "shrink-wrap",
] as const;
type CopilotUseCase = (typeof COPILOT_USE_CASES)[number];

const NEW_AGENT_FIRST_MESSAGE = `<dust_system>
This is a new agent. To start the conversation, you should NOT call any tools. 
Just ask a very simple question, such as "What would you like to build?"
</dust_system>`;

const DUPLICATE_AGENT_FIRST_MESSAGE = `<dust_system>
This is a new agent created by duplicating an existing one.
Call \`get_agent_config\` to retrieve the current configuration, then ask what they'd like to change or add.
</dust_system>`;

async function fetchFirstMessage(
  endpoint: string
): Promise<Result<string, Error>> {
  try {
    const res = await clientFetch(endpoint, { method: "GET" });
    if (!res.ok) {
      return new Err(
        new Error(
          `Failed to fetch copilot first message: ${res.status} ${res.statusText}`
        )
      );
    }
    return new Ok((await res.json()) as string);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

function getCopilotScenario({
  workspaceId,
  isNewAgent,
  isDuplicate,
  templateInfo,
  conversationId,
  agentConfigurationId,
  copilotEdge,
}: {
  workspaceId: string;
  isNewAgent: boolean;
  isDuplicate?: boolean;
  templateInfo?: TemplateInfo;
  conversationId?: string;
  agentConfigurationId?: string;
  copilotEdge: boolean;
}): {
  getFirstMessage: () => Promise<Result<string, Error>>;
  useCase: CopilotUseCase;
} {
  const params = new URLSearchParams();
  let useCase: CopilotUseCase;

  if (templateInfo && templateInfo.copilotInstructions) {
    useCase = "template";
    params.set("templateId", templateInfo.templateId);
  } else if (isDuplicate) {
    useCase = "duplicate";
    return {
      getFirstMessage: () =>
        Promise.resolve(new Ok(DUPLICATE_AGENT_FIRST_MESSAGE)),
      useCase,
    };
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
  } else if (useCase === "new") {
    return {
      getFirstMessage: () => Promise.resolve(new Ok(NEW_AGENT_FIRST_MESSAGE)),
      useCase,
    };
  }

  const queryString = params.toString();
  const path = `/api/w/${workspaceId}/assistant/builder/sidekick/prompt/${useCase}`;
  const endpoint = queryString ? `${path}?${queryString}` : path;
  return {
    getFirstMessage: () => fetchFirstMessage(endpoint),
    useCase,
  };
}

export function useCopilotFirstMessage({
  owner,
  isNewAgent,
  isDuplicate = false,
  templateInfo,
  conversationId,
  agentConfigurationId,
  copilotEdge = false,
}: {
  owner: WorkspaceType;
  isNewAgent: boolean;
  isDuplicate?: boolean;
  templateInfo?: TemplateInfo;
  conversationId?: string;
  agentConfigurationId?: string;
  copilotEdge?: boolean;
}) {
  return useMemo(
    () =>
      getCopilotScenario({
        workspaceId: owner.sId,
        isNewAgent,
        isDuplicate,
        templateInfo,
        conversationId,
        agentConfigurationId,
        copilotEdge,
      }),
    [
      owner.sId,
      isNewAgent,
      isDuplicate,
      templateInfo,
      conversationId,
      agentConfigurationId,
      copilotEdge,
    ]
  );
}
