import type {
  AgentConfigurationScope,
  AgentUserListStatus,
  WorkspaceType,
} from "@dust-tt/types";

import type { PostAgentScopeRequestBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/scope";
import type { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

interface UpdateAgentUserListStatusParams {
  listStatus: AgentUserListStatus;
  owner: WorkspaceType;
  agentConfigurationId: string;
}

interface UpdateAgentUserListStatusResult {
  success: boolean;
  errorMessage?: string;
}

interface UpdateAgentScopeParams {
  scope: Exclude<AgentConfigurationScope, "global">;
  owner: WorkspaceType;
  agentConfigurationId: string;
}

interface UpdateAgentScopeResult {
  success: boolean;
  errorMessage?: string;
}

export async function updateAgentUserListStatus({
  listStatus,
  owner,
  agentConfigurationId,
}: UpdateAgentUserListStatusParams): Promise<UpdateAgentUserListStatusResult> {
  const body: PostAgentListStatusRequestBody = {
    agentId: agentConfigurationId,
    listStatus,
  };

  try {
    const res = await fetch(
      `/api/w/${owner.sId}/members/me/agent_list_status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const data = await res.json();
      return { success: false, errorMessage: data.error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      errorMessage: (error as Error).message || "An unknown error occurred",
    };
  }
}

export async function updateAgentScope({
  scope,
  owner,
  agentConfigurationId,
}: UpdateAgentScopeParams): Promise<UpdateAgentScopeResult> {
  const body: PostAgentScopeRequestBody = {
    scope,
  };

  try {
    const res = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/scope`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const data = await res.json();
      return { success: false, errorMessage: data.error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      errorMessage: (error as Error).message || "An unknown error occurred",
    };
  }
}
