import { getAgentEditors } from "@app/lib/api/assistant/editors";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * An agent plus the associations that live outside of it and are needed to write it back in full:
 * its editors and its skills.
 */
type AgentConfigurationContext = {
  agent: AgentResource;
  editorUsers: UserResource[];
  skills: SkillResource[];
};

// Only a workspace agent (global agents are code-defined) whose current version is active can be
// reproduced: an archived one would be resurrected by writing it back as a new version.
async function getActiveWorkspaceAgent(
  auth: Authenticator,
  agentId: string,
  {
    dangerouslySkipPermissionFiltering,
  }: { dangerouslySkipPermissionFiltering?: boolean }
): Promise<Result<AgentResource, APIErrorWithContentfulStatusCode>> {
  const agent = await AgentResource.fetchById(auth, agentId, {
    dangerouslySkipFetchCheck: dangerouslySkipPermissionFiltering,
  });
  if (!agent) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  }

  if (agent.status !== "active" || agent.scope === "global") {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Archived and global agents cannot be exported or updated.",
      },
    });
  }

  return new Ok(agent);
}

export async function getAgentConfigurationContext(
  auth: Authenticator,
  agentId: string,
  {
    requireEditorGroup = false,
    dangerouslySkipPermissionFiltering,
  }: {
    requireEditorGroup?: boolean;
    // Resolves the agent and its skills even when they request spaces the caller cannot read.
    // Only for callers re-saving the agent as-is: dropping them would silently strip the agent's
    // skills from the new version.
    dangerouslySkipPermissionFiltering?: boolean;
  } = {}
): Promise<
  Result<AgentConfigurationContext, APIErrorWithContentfulStatusCode>
> {
  const agentResult = await getActiveWorkspaceAgent(auth, agentId, {
    dangerouslySkipPermissionFiltering,
  });
  if (agentResult.isErr()) {
    return agentResult;
  }
  const agent = agentResult.value;

  const [skills, editorsResult] = await Promise.all([
    agent.listSkills(auth, {
      permissionFiltering: dangerouslySkipPermissionFiltering
        ? "dangerously_skip"
        : "strict",
    }),
    getAgentEditors(auth, agent),
  ]);

  if (editorsResult.isErr()) {
    if (requireEditorGroup) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Unable to resolve existing agent editors: ${editorsResult.error.message}`,
        },
      });
    }

    return new Ok({
      agent,
      editorUsers: [],
      skills,
    });
  }

  return new Ok({
    agent,
    editorUsers: editorsResult.value,
    skills,
  });
}
