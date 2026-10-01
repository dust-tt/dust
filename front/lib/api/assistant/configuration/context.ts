import { getAgentEditors } from "@app/lib/api/assistant/editors";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { toAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
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

// The full definition is exported or written back as-is, so it needs the content: a redacted
// configuration would export (or re-save) empty instructions and tools. A writer re-saving an agent
// whose content it cannot view gets it from the resave source, whose tools are not listable for the
// caller and are carried over as-is (see `resave-source-content`).
async function getFullAgentConfiguration(
  auth: Authenticator,
  agent: AgentResource,
  { forResave }: { forResave: boolean }
): Promise<Result<AgentConfigurationType | null, Error>> {
  if (agent.canViewContent) {
    const [agentConfiguration] = await toAgentConfigurations(auth, [agent]);
    return new Ok(agentConfiguration ?? null);
  }
  if (!forResave || !auth.can("write", agent)) {
    return new Ok(null);
  }

  const sourceRes = await agent.getResaveSource(auth);
  if (sourceRes.isErr()) {
    return sourceRes;
  }
  const [[agentConfiguration], actions] = await Promise.all([
    toAgentConfigurations(auth, [sourceRes.value]),
    sourceRes.value.listActions(auth, {
      permissionFiltering: "dangerously_skip",
    }),
  ]);
  return new Ok(agentConfiguration ? { ...agentConfiguration, actions } : null);
}

export async function getActiveWorkspaceAgentConfiguration(
  auth: Authenticator,
  agentId: string,
  {
    dangerouslySkipPermissionFiltering,
    forResave = false,
  }: {
    dangerouslySkipPermissionFiltering?: boolean;
    // The configuration is only written back as a new version, never returned to the caller.
    forResave?: boolean;
  } = {}
): Promise<
  Result<ActiveWorkspaceAgentConfiguration, APIErrorWithContentfulStatusCode>
> {
  const agent = await AgentResource.fetchById(auth, agentId, {
    dangerouslySkipFetchCheck: dangerouslySkipPermissionFiltering,
  });
  const agentConfigurationRes = agent
    ? await getFullAgentConfiguration(auth, agent, { forResave })
    : new Ok(null);
  if (agentConfigurationRes.isErr()) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: agentConfigurationRes.error.message,
      },
    });
  }
  const agentConfiguration = agentConfigurationRes.value;

  if (!agentConfiguration) {
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
    forResave,
  }: {
    requireEditorGroup?: boolean;
    forResave?: boolean;
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
      forResave,
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
  const editorsResult = await getAgentEditors(auth, agentConfiguration);

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
      agentConfiguration,
      editorUsers: [],
      skills,
    });
  }

  return new Ok({
    agentConfiguration,
    editorUsers: editorsResult.value,
    skills,
  });
}
