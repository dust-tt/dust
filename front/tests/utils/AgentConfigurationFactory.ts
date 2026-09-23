import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type {
  AgentConfigurationType,
  AgentReinforcementMode,
} from "@app/types/assistant/agent";
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
      instructions: string;
      instructionsHtml: string | null;
      scope: Exclude<AgentConfigurationType["scope"], "global">;
      model: {
        providerId: ModelProviderIdType;
        modelId: ModelIdType;
        temperature?: number;
      };
      requestedSpaceIds: ModelId[];
      templateId: string | null;
      reinforcement: AgentReinforcementMode;
    }> = {}
  ): Promise<AgentConfigurationType> {
    const name = overrides.name ?? "Test Agent";
    const description = overrides.description ?? "Test Agent Description";
    const instructions = overrides.instructions ?? "Test Instructions";
    const instructionsHtml = overrides.instructionsHtml ?? null;
    const scope = overrides.scope ?? "visible";
    const providerId = overrides.model?.providerId ?? "openai";
    const modelId = overrides.model?.modelId ?? "gpt-5-mini";
    const temperature = overrides.model?.temperature ?? 0.7;
    const requestedSpaceIds = overrides.requestedSpaceIds ?? [];

    const user = auth.user();
    assert(user, "User is required");

    const workspace = auth.getNonNullableWorkspace();
    // Some legacy tests use an auth without workspace membership. Such users cannot receive an
    // editor grant, but authorId below still preserves attribution.
    const editors = Authenticator.isMember(auth.role()) ? [user.toJSON()] : [];

    // Internal auth only bypasses the create capability; explicit authorId keeps attribution.
    const internalAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const result = await AgentResource.makeNew(internalAuth, {
      name,
      description,
      instructions,
      instructionsHtml,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope,
      model: {
        providerId,
        modelId,
        temperature,
      },
      templateId: overrides.templateId ?? null,
      reinforcement: overrides.reinforcement,
      requestedSpaceIds,
      tags: [], // Added missing tags property
      editors,
      authorId: user.id,
    });

    if (result.isErr()) {
      throw result.error;
    }

    // Refresh the caller so tests see group memberships added earlier in the same test. The save
    // above uses `internalAuth`, whose refresh cannot update the caller's permission snapshot.
    await auth.refresh();

    // Re-read the full config: as the caller when they are a workspace member (so the returned
    // verbs reflect their editor grant), otherwise as the internal admin — legacy tests build agents
    // with a non-member auth, which `getAgentConfigurations` rejects.
    // `dangerouslySkipPermissionFiltering` lets tests build agents on spaces the caller cannot read.
    const readAuth = auth.isUser() ? auth : internalAuth;
    const config = await getAgentConfiguration(readAuth, {
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

    // A partial update: `scope` is intentionally omitted so the agent keeps its current scope (this
    // helper updates the definition/editors, it does not (un)publish — which would need the `publish`
    // capability the test caller may not hold).
    const result = await agentResource.updateConfiguration(auth, {
      name: overrides.name ?? "Test Agent",
      description: overrides.description ?? "Test Agent Description",
      instructions: overrides.instructions ?? "Updated Test Instructions",
      instructionsHtml: overrides.instructionsHtml ?? null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
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
      // Explicitly clear tools/skills: `updateConfiguration` is a partial merge (an omitted field
      // keeps its current value), and this helper's contract is to produce a bare updated version.
      actions: [],
      skills: [],
    });

    if (result.isErr()) {
      throw result.error;
    }

    return {
      ...result.value.resource.toJSON(),
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
