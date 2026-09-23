import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import assert from "assert";

export const getAuthors = async (
  agentConfigurations: LightAgentConfigurationType[]
): Promise<UserType[]> => {
  const authorIds = new Set(
    removeNulls(agentConfigurations.map((a) => a.versionAuthorId))
  );
  const authors = await UserResource.fetchByModelIds(Array.from(authorIds));
  return authors.map((a) => a.toJSON());
};

/**
 * @cc [owner:philipperolet,label:product] global-agents-have-no-editors
 * A global agent has no editor grant and MUST NOT be treated as having an empty editor set:
 * `getAgentEditors` fails with `group_not_found` so callers keep returning 404 rather than an
 * editable empty list.
 */
export async function getAgentEditors(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType
): Promise<Result<UserResource[], DustError<"group_not_found">>> {
  if (agentConfiguration.scope === "global") {
    return new Err(
      new DustError("group_not_found", "Global agents have no editors.")
    );
  }

  const resource = await AgentResource.fetchById(auth, agentConfiguration.sId);
  if (!resource) {
    return new Err(
      new DustError("group_not_found", "Unable to find the agent.")
    );
  }
  const editors = await resource.listEditors(auth);
  assert(editors !== null);

  return new Ok(editors);
}

export const getEditors = async (
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType
): Promise<UserType[]> => {
  const editors = await getAgentEditors(auth, agentConfiguration);
  if (editors.isErr()) {
    // We could do better here but this is not a critical path.
    return [];
  }
  return editors.value.map((editor) => editor.toJSON());
};

/**
 * @cc [owner:philipperolet,label:product] active-agent-editors
 * Returned editors must have active membership in the workspace and their agent's editor group.
 */
export const getAgentsEditors = async (
  auth: Authenticator,
  agentConfigurations: LightAgentConfigurationType[]
): Promise<Record<string, UserType[]>> => {
  const resources = await AgentResource.fetchByIds(
    auth,
    agentConfigurations
      .filter((agent) => agent.scope !== "global")
      .map((agent) => agent.sId)
  );
  const editorsByAgentId = await AgentResource.batchListEditors(
    auth,
    resources
  );

  return Object.fromEntries(
    [...editorsByAgentId].map(([agentId, editors]) => {
      assert(editors !== null);
      return [agentId, editors.map((editor) => editor.toJSON())];
    })
  );
};
