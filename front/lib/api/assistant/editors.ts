import type { Authenticator } from "@app/lib/auth";
import { DustError, isDustError } from "@app/lib/error";
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

export type EditorDeltaErrorCode =
  | "user_already_member"
  | "user_not_member"
  | "user_not_found"
  | "internal_error";

/**
 * @cc [owner:philipperolet,label:security;product] editor-removal-uses-grants
 * Translating add/remove deltas MUST validate against the grant-backed editor set (`listEditors`):
 * removing a user who holds no editor grant MUST fail with `user_not_member`, and adding a user who
 * already holds one MUST fail with `user_already_member`. Neither changes any grant.
 */
export async function updateAgentEditorsFromDelta(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  {
    usersToAdd,
    usersToRemove,
  }: { usersToAdd: UserResource[]; usersToRemove: UserResource[] }
): Promise<Result<AgentResource, DustError<EditorDeltaErrorCode>>> {
  const agentResource = await AgentResource.fetchById(auth, agent.sId);
  if (!agentResource) {
    return new Err(
      new DustError("internal_error", "Unable to find the agent.")
    );
  }
  const currentEditors = (await agentResource.listEditors(auth)) ?? [];
  const currentEditorModelIds = new Set(currentEditors.map((u) => u.id));

  if (usersToAdd.some((u) => currentEditorModelIds.has(u.id))) {
    return new Err(
      new DustError(
        "user_already_member",
        "The user is already a member of the agent editors group."
      )
    );
  }

  if (usersToRemove.some((u) => !currentEditorModelIds.has(u.id))) {
    return new Err(
      new DustError(
        "user_not_member",
        "The user is not a member of the agent editors group."
      )
    );
  }

  const removeEditorModelIds = new Set(usersToRemove.map((u) => u.id));
  const nextEditors = [
    ...currentEditors.filter((u) => !removeEditorModelIds.has(u.id)),
    ...usersToAdd,
  ].map((u) => u.toJSON());

  const updateRes = await agentResource.updateConfiguration(auth, {
    editors: nextEditors,
  });
  if (updateRes.isErr()) {
    const { error } = updateRes;
    if (isDustError(error) && error.code === "user_not_found") {
      return new Err(
        new DustError(
          "user_not_found",
          "The user was not found in the workspace."
        )
      );
    }
    return new Err(new DustError("internal_error", error.message));
  }

  return new Ok(updateRes.value.resource);
}
