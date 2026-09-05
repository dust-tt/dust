import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { shadowAgentEditors } from "@app/lib/api/assistant/editors";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * An agent configuration whose full definition can be reproduced: a workspace agent (global
 * agents are code-defined) whose current version is active (an archived one would be resurrected
 * by writing it back as a new version).
 */
type ActiveWorkspaceAgentConfiguration = AgentConfigurationType & {
  scope: Exclude<AgentConfigurationType["scope"], "global">;
  status: "active";
};

/**
 * An agent configuration plus the associations that live outside of it and are needed to write it
 * back in full: its editors and its skills.
 */
type AgentConfigurationContext = {
  agentConfiguration: ActiveWorkspaceAgentConfiguration;
  editorUsers: UserResource[];
  skills: SkillResource[];
};

function isActiveWorkspaceAgentConfiguration(
  agentConfiguration: AgentConfigurationType
): agentConfiguration is ActiveWorkspaceAgentConfiguration {
  return (
    agentConfiguration.status === "active" &&
    agentConfiguration.scope !== "global"
  );
}

export async function getActiveWorkspaceAgentConfiguration(
  auth: Authenticator,
  agentId: string,
  {
    dangerouslySkipPermissionFiltering,
  }: { dangerouslySkipPermissionFiltering?: boolean } = {}
): Promise<
  Result<ActiveWorkspaceAgentConfiguration, APIErrorWithContentfulStatusCode>
> {
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId,
    variant: "full",
    dangerouslySkipPermissionFiltering,
  });

  if (!agentConfiguration || (!agentConfiguration.canRead && !auth.isAdmin())) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  }

  if (!isActiveWorkspaceAgentConfiguration(agentConfiguration)) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Archived and global agents cannot be exported or updated.",
      },
    });
  }

  return new Ok(agentConfiguration);
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
  const agentResult = await getActiveWorkspaceAgentConfiguration(
    auth,
    agentId,
    {
      dangerouslySkipPermissionFiltering,
    }
  );
  if (agentResult.isErr()) {
    return agentResult;
  }

  const agentConfiguration = agentResult.value;

  const skills = await SkillResource.listByAgentConfiguration(
    auth,
    agentConfiguration,
    {
      permissionFiltering: dangerouslySkipPermissionFiltering
        ? "dangerously_skip"
        : "strict",
    }
  );
  const editorsResult = await GroupResource.findEditorGroupForAgent(
    auth,
    agentConfiguration
  );

  if (editorsResult.isErr()) {
    await shadowAgentEditors(
      auth,
      agentConfiguration,
      [],
      "getAgentConfigurationContext"
    );
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
      agentConfiguration,
      editorUsers: [],
      skills,
    });
  }

  const editorUsers = await shadowAgentEditors(
    auth,
    agentConfiguration,
    await editorsResult.value.getActiveMembers(auth),
    "getAgentConfigurationContext"
  );

  return new Ok({ agentConfiguration, editorUsers, skills });
}
