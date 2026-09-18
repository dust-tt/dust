import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";

export class AgentConfigurationFactory {
  static async createTestAgent(
    auth: Authenticator,
    overrides: Partial<{
      name: string;
      description: string;
      scope: Exclude<AgentConfigurationType["scope"], "global">;
      model: {
        providerId: ModelProviderIdType;
        modelId: ModelIdType;
        temperature?: number;
      };
      requestedSpaceIds: ModelId[];
    }> = {}
  ): Promise<AgentConfigurationType> {
    const name = overrides.name ?? "Test Agent";
    const description = overrides.description ?? "Test Agent Description";
    const scope = overrides.scope ?? "visible";
    const providerId = overrides.model?.providerId ?? "openai";
    const modelId = overrides.model?.modelId ?? "gpt-5-mini";
    const temperature = overrides.model?.temperature ?? 0.7;
    const requestedSpaceIds = overrides.requestedSpaceIds ?? [];

    const user = auth.user();
    assert(user, "User is required");

    const workspace = auth.getNonNullableWorkspace();
    // Some legacy tests use an auth without workspace membership. Such users cannot belong to an
    // editor group, but authorId below still preserves attribution and the author fallback.
    const editors = Authenticator.isMember(auth.role()) ? [user.toJSON()] : [];

    // Internal auth only bypasses the create/publish capabilities; explicit authorId keeps attribution.
    const internalAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const result = await AgentResource.makeNew(internalAuth, {
      name,
      description,
      instructions: "Test Instructions",
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope,
      model: {
        providerId,
        modelId,
        temperature,
      },
      templateId: null,
      requestedSpaceIds,
      tags: [], // Added missing tags property
      editors,
      authorId: user.id,
    });

    if (result.isErr()) {
      throw result.error;
    }

    // createAgentConfiguration refreshes its own `auth` argument's group memberships as a side
    // effect of creating the new editor group. Since we called it with `internalAuth` above,
    // mirror that refresh onto the caller's own `auth` so tests that rely on it seeing
    // just-added group memberships (added earlier in the same test, before this call) keep
    // working as if `auth` itself had been used.
    await auth.refresh();

    // makeNew resolves the resource for its saver (the internal admin). Re-read the full config as
    // the caller — `dangerouslySkipPermissionFiltering` so tests may build agents on spaces the
    // caller cannot read (the agent still ends up correctly space-restricted).
    const config = await getAgentConfiguration(auth, {
      agentId: result.value.sId,
      variant: "full",
      dangerouslySkipPermissionFiltering: true,
    });
    assert(config, "The saved agent must be resolvable");

    return config;
  }

  /**
   * Updates an existing agent configuration, creating a new version.
   * Pass the sId of the existing agent to update it.
   */
  static async updateTestAgent(
    auth: Authenticator,
    agentId: string,
    overrides: Partial<{
      name: string;
      description: string;
      instructions: string;
      instructionsHtml: string | null;
      requestedSpaceIds: ModelId[];
    }> = {}
  ): Promise<AgentConfigurationType> {
    const user = auth.user();
    assert(user, "User is required");

    const agentResource = await AgentResource.fetchById(auth, agentId);
    assert(
      agentResource && auth.can("read", agentResource),
      "Agent configuration not found"
    );

    const result = await agentResource.updateConfiguration(auth, {
      name: overrides.name ?? "Test Agent",
      description: overrides.description ?? "Test Agent Description",
      instructions: overrides.instructions ?? "Updated Test Instructions",
      instructionsHtml: overrides.instructionsHtml ?? null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "visible",
      model: {
        providerId: "openai",
        modelId: "gpt-5-mini",
        temperature: 0.7,
      },
      templateId: null,
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
      requestedSpaceIds: overrides.requestedSpaceIds ?? [],
    });

    if (result.isErr()) {
      throw result.error;
    }

    return {
      ...result.value.toJSON(),
      tags: [],
      userFavorite: false,
      instructionsHtml: overrides.instructionsHtml ?? null,
      actions: [],
    };
  }

  /**
   * Backdates an agent and every one of its versions, for features that treat a young agent
   * differently.
   */
  static async backdate(
    auth: Authenticator,
    agentId: string,
    createdAt: Date
  ): Promise<void> {
    const where = {
      sId: agentId,
      workspaceId: auth.getNonNullableWorkspace().id,
    };
    await Promise.all([
      AgentModel.update({ createdAt }, { where }),
      AgentConfigurationModel.update({ createdAt }, { where }),
    ]);
  }
}
