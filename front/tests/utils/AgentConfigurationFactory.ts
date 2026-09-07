import { createAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
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

    // Internal auth only bypasses the create capability; explicit authorId keeps attribution.
    const internalAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const result = await createAgentConfiguration(internalAuth, {
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

    return { ...result.value, instructionsHtml: null, actions: [] };
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

    const result = await createAgentConfiguration(auth, {
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
      agentConfigurationId: agentId,
      requestedSpaceIds: overrides.requestedSpaceIds ?? [],
    });

    if (result.isErr()) {
      throw result.error;
    }

    return {
      ...result.value,
      instructionsHtml: overrides.instructionsHtml ?? null,
      actions: [],
    };
  }

  /** Backdates every version of an agent, for features that treat a young agent differently. */
  static async backdate(
    auth: Authenticator,
    agentId: string,
    createdAt: Date
  ): Promise<void> {
    await AgentConfigurationModel.update(
      { createdAt },
      {
        where: {
          sId: agentId,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      }
    );
  }
}
