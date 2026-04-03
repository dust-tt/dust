import Anthropic from "@anthropic-ai/sdk";
import config from "@app/lib/api/config";
import { isGoogleAuthenticationErrorMessage } from "@app/lib/api/llm/clients/google/utils/errors";
import type { Authenticator } from "@app/lib/auth";
import { ProviderCredentialModel } from "@app/lib/models/provider_credential";
import { notifyProviderCredentialsHealthUpdated } from "@app/lib/notifications/workflows/provider-credential-updated";
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
  type ApiKeyCredentialsType,
  type ProviderCredentialType,
} from "@app/types/provider_credential";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { redactString } from "@app/types/shared/utils/string_utils";
import { GoogleGenAI } from "@google/genai";
import assert from "assert";
import OpenAI from "openai";
import type { Attributes, ModelStatic } from "sequelize";

const API_KEY_REVEAL_WINDOW_MINUTES = 2;
const PROVIDER_CREDENTIALS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

type CachedProviderCredential = {
  id: ModelId;
  workspaceId: ModelId;
  providerId: ByokModelProviderIdType;
  credentialId: string;
  isHealthy: boolean;
  placeholder: string;
  editedByUserId: ModelId | null;
  createdAt: number;
  updatedAt: number;
  credentials: ApiKeyCredentialsType;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
export interface ProviderCredentialResource
  extends ReadonlyAttributesType<ProviderCredentialModel> {}
export class ProviderCredentialResource extends BaseResource<ProviderCredentialModel> {
  static model: ModelStaticWorkspaceAware<ProviderCredentialModel> =
    ProviderCredentialModel;

  private _credentials: ApiKeyCredentialsType;

  constructor(
    model: ModelStatic<ProviderCredentialModel>,
    blob: Attributes<ProviderCredentialModel>,
    credentials: ApiKeyCredentialsType
  ) {
    super(ProviderCredentialModel, blob);
    this._credentials = credentials;
  }

  get sId(): string {
    return makeSId("provider_credential", {
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  get credentials(): ApiKeyCredentialsType {
    return this._credentials;
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
    { cacheNullValues: false, ttlMs: PROVIDER_CREDENTIALS_CACHE_TTL_MS }
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

  static async fetchByProvider(
    auth: Authenticator,
    providerId: ByokModelProviderIdType
  ): Promise<ProviderCredentialResource | null> {
    const plan = auth.getNonNullablePlan();
    assert(
      plan.isByok,
      "BYOK must be enabled to fetch a provider's credentials."
    );

    const workspace = auth.getNonNullableWorkspace();
    const model = await this.model.findOne({
      where: { workspaceId: workspace.id, providerId },
    });
    if (!model) {
      return null;
    }
    return this.makeNewFromModel(model);
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

    notifyProviderCredentialsHealthUpdated(auth);

    return new ProviderCredentialResource(
      ProviderCredentialModel,
      model.get(),
      // TODO (BYOK): handle different credential content shapes for different providers
      { api_key: apiKey }
    );
  }

  async updateApiKey(
    auth: Authenticator,
    { apiKey }: { apiKey: string }
  ): Promise<ProviderCredentialResource | null> {
    assert(auth.isAdmin(), "Only admins can update provider credentials.");
    const plan = auth.getNonNullablePlan();
    assert(plan.isByok, "BYOK must be enabled to update provider credentials.");

    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const isHealthy = await isCredentialHealthy({
      provider: this.providerId,
      credentials: { api_key: apiKey },
    });

    if (!isHealthy) {
      logger.warn(
        { providerId: this.providerId, workspaceId: workspace.sId },
        `Provided credentials for provider ${this.providerId} are not healthy.`
      );
      return null;
    }

    const oauthClient = new OAuthAPI(config.getOAuthAPIConfig(), logger);

    const oauthRes = await oauthClient.postCredentials({
      provider: this.providerId,
      workspaceId: workspace.sId,
      userId: user.sId,
      credentials: { api_key: apiKey },
    });

    if (oauthRes.isErr()) {
      logger.error(
        {
          providerId: this.providerId,
          error: oauthRes.error,
          workspaceId: workspace.sId,
        },
        `Failed to post credentials to OAuth API : ${oauthRes.error.message}`
      );
      return null;
    }

    const oldCredentialId = this.credentialId;

    const [affectedCount] = await this.update({
      credentialId: oauthRes.value.credential.credential_id,
      isHealthy: true,
      editedByUserId: user.id,
    });

    if (affectedCount === 0) {
      await oauthClient.deleteCredentials({
        credentialsId: oauthRes.value.credential.credential_id,
      });

      throw new Error("Failed to update provider credential.");
    }

    await oauthClient.deleteCredentials({
      credentialsId: oldCredentialId,
    });

    await ProviderCredentialResource.invalidateProviderCredentialCache(
      workspace.id
    );

    notifyProviderCredentialsHealthUpdated(auth);

    return this;
  }

  static async listByWorkspace(
    auth: Authenticator
  ): Promise<ProviderCredentialResource[]> {
    return this.baseFetch(auth);
  }

  /**
   * Fetches health records for all providers in a workspace by workspace model ID.
   * Bypasses auth check for use during Authenticator initialization.
   */
  static async fetchProvidersHealthByWorkspaceId(
    workspaceId: ModelId
  ): Promise<Partial<Record<ByokModelProviderIdType, boolean>>> {
    const cached = await this.baseFetchCached(workspaceId);

    return Object.fromEntries(cached.map((c) => [c.providerId, c.isHealthy]));
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    await ProviderCredentialModel.destroy({
      where: { workspaceId: workspace.id },
    });

    await this.invalidateProviderCredentialCache(workspace.id);
  }

  static async markAsUnhealthy(
    auth: Authenticator,
    { providerId }: { providerId: ByokModelProviderIdType }
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    assert(
      auth.getNonNullablePlan().isByok,
      "BYOK must be enabled to mark provider credentials as unhealthy."
    );

    const credential = await this.fetchByProvider(auth, providerId);
    if (!credential) {
      return;
    }

    const isAuthError = await hasCredentialAuthError({
      provider: providerId,
      credentials: credential.credentials,
    });

    if (!isAuthError) {
      return;
    }

    const [affectedCount] = await ProviderCredentialModel.update(
      { isHealthy: false },
      { where: { workspaceId: workspace.id, providerId, isHealthy: true } }
    );

    if (affectedCount > 0) {
      await this.invalidateProviderCredentialCache(workspace.id);
      notifyProviderCredentialsHealthUpdated(auth);
    }
  }

  async delete(
    auth: Authenticator
  ): Promise<Result<number | undefined, Error>> {
    assert(auth.isAdmin(), "Only admins can delete provider credentials.");
    assert(
      auth.getNonNullablePlan().isByok,
      "BYOK must be enabled to delete provider credentials."
    );

    try {
      const workspace = auth.getNonNullableWorkspace();
      const affectedCount = await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: workspace.id,
        },
      });

      if (affectedCount !== 0) {
        const oauthClient = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        await oauthClient.deleteCredentials({
          credentialsId: this.credentialId,
        });

        await ProviderCredentialResource.invalidateProviderCredentialCache(
          workspace.id
        );

        notifyProviderCredentialsHealthUpdated(auth);
      }

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
        ? redactString(this._credentials.api_key.slice(-20), 4)
        : this._credentials.api_key;

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
      } catch (error) {
        logger.warn(
          { error },
          "Error while validating Google AI Studio credentials"
        );
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
      } catch (error) {
        logger.warn(
          { error },
          "Error while validating Google AI Studio credentials"
        );
        return false;
      }

      return true;
    }
    case "google_ai_studio": {
      const client = new GoogleGenAI({
        apiKey: credentials.api_key,
      });

      try {
        await client.models.list();
      } catch (error) {
        logger.warn(
          { error },
          "Error while validating Google AI Studio credentials"
        );
        return false;
      }

      return true;
    }
    default:
      assertNever(provider);
  }
}

// Returns true only if the credential fails with a 401 authentication error,
// which confirms the key is invalid (not just a transient network/rate-limit issue).
async function hasCredentialAuthError({
  provider,
  credentials,
}: ModelProviderPostCredentialsBody): Promise<boolean> {
  switch (provider) {
    case "anthropic": {
      const client = new Anthropic({ apiKey: credentials.api_key });
      try {
        await client.models.list();
        return false;
      } catch (error) {
        return error instanceof Anthropic.AuthenticationError;
      }
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
        return false;
      } catch (error) {
        return error instanceof OpenAI.AuthenticationError;
      }
    }
    case "google_ai_studio": {
      const client = new GoogleGenAI({
        apiKey: credentials.api_key,
      });
      try {
        await client.models.list();
        return false;
      } catch (error) {
        const normalized = normalizeError(error);

        return isGoogleAuthenticationErrorMessage(normalized.message);
      }
    }
    default:
      assertNever(provider);
  }
}
