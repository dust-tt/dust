import Anthropic from "@anthropic-ai/sdk";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { ProviderCredentialModel } from "@app/lib/models/provider_credential";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import {
  type ModelProviderPostCredentialsBody,
  OAuthAPI,
} from "@app/types/oauth/oauth_api";
import {
  ApiKeyCredentialContentSchema,
  type LLMCredentialsType,
  PROVIDER_TO_CREDENTIAL_KEY,
  type ProviderCredentialType,
} from "@app/types/provider_credential";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { EnvironmentConfig } from "@app/types/shared/utils/config";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { redactString } from "@app/types/shared/utils/string_utils";
import assert from "assert";
import OpenAI from "openai";
import type { Attributes, ModelStatic } from "sequelize";
import type { z } from "zod";

const API_KEY_REVEAL_WINDOW_MINUTES = 5;

type CachedProviderCredential = {
  id: number;
  workspaceId: number;
  providerId: ByokModelProviderIdType;
  credentialId: string;
  isHealthy: boolean;
  placeholder: string;
  editedByUserId: number | null;
  createdAt: number;
  updatedAt: number;
  credentials: { api_key: string };
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
export interface ProviderCredentialResource
  extends ReadonlyAttributesType<ProviderCredentialModel> {}
export class ProviderCredentialResource extends BaseResource<ProviderCredentialModel> {
  static model: ModelStaticWorkspaceAware<ProviderCredentialModel> =
    ProviderCredentialModel;

  private credentials: z.infer<typeof ApiKeyCredentialContentSchema>;

  constructor(
    model: ModelStatic<ProviderCredentialModel>,
    blob: Attributes<ProviderCredentialModel>,
    credentials: z.infer<typeof ApiKeyCredentialContentSchema>
  ) {
    super(ProviderCredentialModel, blob);
    this.credentials = credentials;
  }

  get sId(): string {
    return makeSId("provider_credential", {
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  // TODO (BYOK): Move out of resource
  private static get dustManagedLLMCredentials(): LLMCredentialsType {
    const env = (key: string) =>
      EnvironmentConfig.getOptionalEnvVariable(key) ?? "";

    return {
      ANTHROPIC_API_KEY: env("DUST_MANAGED_ANTHROPIC_API_KEY"),
      AZURE_OPENAI_API_KEY: env("DUST_MANAGED_AZURE_OPENAI_API_KEY"),
      AZURE_OPENAI_ENDPOINT: env("DUST_MANAGED_AZURE_OPENAI_ENDPOINT"),
      MISTRAL_API_KEY: env("DUST_MANAGED_MISTRAL_API_KEY"),
      OPENAI_API_KEY: env("DUST_MANAGED_OPENAI_API_KEY"),
      OPENAI_BASE_URL: env("DUST_MANAGED_OPENAI_BASE_URL"),
      OPENAI_USE_EU_ENDPOINT:
        config.getRegion() === "europe-west1" ? "true" : "false",
      TEXTSYNTH_API_KEY: env("DUST_MANAGED_TEXTSYNTH_API_KEY"),
      GOOGLE_AI_STUDIO_API_KEY: env("DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY"),
      TOGETHERAI_API_KEY: env("DUST_MANAGED_TOGETHERAI_API_KEY"),
      DEEPSEEK_API_KEY: env("DUST_MANAGED_DEEPSEEK_API_KEY"),
      FIREWORKS_API_KEY: env("DUST_MANAGED_FIREWORKS_API_KEY"),
      XAI_API_KEY: env("DUST_MANAGED_XAI_API_KEY"),
    };
  }

  private static async makeNewFromModel(
    model: ProviderCredentialModel
  ): Promise<ProviderCredentialResource> {
    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    const { providerId, credentialId } = model;
    const credentialRes = await oauthApi.getCredentials({
      credentialsId: credentialId,
    });

    if (credentialRes.isErr()) {
      logger.error(
        {
          providerId,
          credentialId,
          error: credentialRes.error,
          workspaceId: model.workspaceId,
        },
        `Failed to fetch OAuth credentials for provider ${providerId}`
      );
      throw new Error(
        `Failed to fetch OAuth credentials for provider ${providerId}`
      );
    }

    const credentials = ApiKeyCredentialContentSchema.parse(
      credentialRes.value.credential.content
    );
    return new ProviderCredentialResource(
      ProviderCredentialModel,
      model.get(),
      credentials
    );
  }

  private static readonly providerCredentialCacheKeyResolver = (
    workspaceModelId: ModelId
  ) => `provider_credentials:workspaceId:${workspaceModelId}`;

  private static async _baseFetchUncached(
    workspaceModelId: ModelId
  ): Promise<CachedProviderCredential[]> {
    const models = await ProviderCredentialResource.model.findAll({
      where: { workspaceId: workspaceModelId },
    });

    const resources = await concurrentExecutor(
      models,
      ProviderCredentialResource.makeNewFromModel,
      { concurrency: 8 }
    );

    return resources.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      providerId: r.providerId,
      credentialId: r.credentialId,
      isHealthy: r.isHealthy,
      placeholder: r.placeholder,
      editedByUserId: r.editedByUserId,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
      credentials: r.credentials,
    }));
  }

  // Cache eviction is handled by Redis's allkeys-lfu eviction policy.
  private static baseFetchCached = cacheWithRedis(
    ProviderCredentialResource._baseFetchUncached,
    ProviderCredentialResource.providerCredentialCacheKeyResolver,
    { cacheNullValues: false }
  );

  private static invalidateProviderCredentialCache = invalidateCacheWithRedis(
    ProviderCredentialResource._baseFetchUncached,
    ProviderCredentialResource.providerCredentialCacheKeyResolver
  );

  private static fromCachedData(
    data: CachedProviderCredential
  ): ProviderCredentialResource {
    const blob: Attributes<ProviderCredentialModel> = {
      id: data.id,
      workspaceId: data.workspaceId,
      providerId: data.providerId,
      credentialId: data.credentialId,
      isHealthy: data.isHealthy,
      placeholder: data.placeholder,
      editedByUserId: data.editedByUserId,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
    return new ProviderCredentialResource(
      ProviderCredentialModel,
      blob,
      data.credentials
    );
  }

  private static async baseFetch(
    auth: Authenticator
  ): Promise<ProviderCredentialResource[]> {
    const plan = auth.getNonNullablePlan();
    assert(plan.isByok, "BYOK must be enabled to fetch provider credentials.");

    const workspace = auth.getNonNullableWorkspace();
    const cached = await this.baseFetchCached(workspace.id);

    return cached.map(this.fromCachedData);
  }

  static async makeNew(
    auth: Authenticator,
    {
      providerId,
      apiKey,
    }: {
      providerId: ByokModelProviderIdType;
      apiKey: string;
    }
  ): Promise<ProviderCredentialResource | null> {
    assert(auth.isAdmin(), "Only admins can create provider credentials.");
    assert(
      auth.getNonNullablePlan().isByok,
      "BYOK must be enabled to create provider credentials."
    );

    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const isHealthy = await isCredentialHealthy({
      provider: providerId,
      credentials: { api_key: apiKey },
    });

    if (!isHealthy) {
      logger.warn(
        {
          providerId,
          workspaceId: workspace.sId,
        },
        `Provided credentials for provider ${providerId} are not healthy.`
      );

      return null;
    }

    const oauthClient = new OAuthAPI(config.getOAuthAPIConfig(), logger);

    const oauthRes = await oauthClient.postCredentials({
      provider: providerId,
      workspaceId: workspace.sId,
      userId: user.sId,
      credentials: { api_key: apiKey },
    });

    if (oauthRes.isErr()) {
      logger.error(
        {
          providerId,
          error: oauthRes.error,
          workspaceId: workspace.sId,
        },
        `Failed to post credentials to OAuth API : ${oauthRes.error.message}`
      );
      return null;
    }

    const model = await this.model.create({
      workspaceId: workspace.id,
      providerId,
      credentialId: oauthRes.value.credential.credential_id,
      isHealthy: true,
      // TODO(BYOK): remove after obfuscation has been implemented
      placeholder: "",
      editedByUserId: user.id,
    });

    await this.invalidateProviderCredentialCache(workspace.id);

    return new ProviderCredentialResource(
      ProviderCredentialModel,
      model.get(),
      // TODO (BYOK): handle different credential content shapes for different providers
      { api_key: apiKey }
    );
  }

  static async listByWorkspace(
    auth: Authenticator
  ): Promise<ProviderCredentialResource[]> {
    return this.baseFetch(auth);
  }

  // TODO (BYOK): move out of resource
  static async getCredentials(
    auth: Authenticator
  ): Promise<LLMCredentialsType> {
    const plan = auth.getNonNullablePlan();

    if (!plan.isByok) {
      return this.dustManagedLLMCredentials;
    }

    const providerCredentials = await this.baseFetch(auth);

    return mapOauthCredentialsToLlmCredentials(
      providerCredentials.map((cred) => ({
        providerId: cred.providerId,
        content: cred.credentials,
      }))
    );
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    await ProviderCredentialModel.destroy({
      where: { workspaceId: workspace.id },
    });

    await this.invalidateProviderCredentialCache(workspace.id);
  }

  async delete(
    auth: Authenticator
  ): Promise<Result<number | undefined, Error>> {
    try {
      const workspace = auth.getNonNullableWorkspace();
      const affectedCount = await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: workspace.id,
        },
      });

      await ProviderCredentialResource.invalidateProviderCredentialCache(
        workspace.id
      );

      return new Ok(affectedCount);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  toJSON(): ProviderCredentialType {
    const timeDifference = Math.abs(
      new Date().getTime() - new Date(this.updatedAt).getTime()
    );
    const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
    const apiKey =
      differenceInMinutes > API_KEY_REVEAL_WINDOW_MINUTES
        ? redactString(this.credentials.api_key, 4)
        : this.credentials.api_key;

    return {
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      providerId: this.providerId,
      credentialId: this.credentialId,
      isHealthy: this.isHealthy,
      placeholder: this.placeholder,
      editedByUserId: this.editedByUserId,
      credentials: { api_key: apiKey },
    };
  }
}

// TODO (BYOK): Move out of resource
function mapOauthCredentialsToLlmCredentials(
  oauthCredentials: {
    providerId: ByokModelProviderIdType;
    content: z.infer<typeof ApiKeyCredentialContentSchema>;
  }[]
): LLMCredentialsType {
  const result: LLMCredentialsType = {};

  for (const { providerId, content } of oauthCredentials) {
    switch (providerId) {
      case "openai": {
        result.OPENAI_API_KEY = content.api_key;
        break;
      }
      case "anthropic": {
        result[PROVIDER_TO_CREDENTIAL_KEY[providerId]] = content.api_key;
        break;
      }
      default:
        assertNever(providerId);
    }
  }

  return result;
}

async function isCredentialHealthy({
  provider,
  credentials,
}: ModelProviderPostCredentialsBody): Promise<boolean> {
  switch (provider) {
    case "anthropic": {
      const client = new Anthropic({
        apiKey: credentials.api_key,
      });
      try {
        await client.models.list();
      } catch (_error) {
        return false;
      }

      return true;
    }
    case "openai": {
      const client = new OpenAI({
        apiKey: credentials.api_key,
        defaultHeaders: {
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json; charset=utf-8",
        },
      });

      try {
        await client.models.list();
      } catch (_error) {
        return false;
      }

      return true;
    }
    default:
      assertNever(provider);
  }
}
