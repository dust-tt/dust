import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { ProviderCredentialModel } from "@app/lib/models/provider_credential";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { ConnectionCredentials } from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { LLMCredentialsType } from "@app/types/provider_credential";
import {
  PROVIDER_CREDENTIAL_CONTENT_SCHEMAS,
  PROVIDER_TO_CREDENTIAL_KEY,
  type ProviderCredentialType,
} from "@app/types/provider_credential";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { EnvironmentConfig } from "@app/types/shared/utils/config";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import type { Attributes, ModelStatic } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
export interface ProviderCredentialResource
  extends ReadonlyAttributesType<ProviderCredentialModel> {}
export class ProviderCredentialResource extends BaseResource<ProviderCredentialModel> {
  static model: ModelStaticWorkspaceAware<ProviderCredentialModel> =
    ProviderCredentialModel;

  constructor(
    model: ModelStatic<ProviderCredentialModel>,
    blob: Attributes<ProviderCredentialModel>
  ) {
    super(ProviderCredentialModel, blob);
  }

  get sId(): string {
    return makeSId("provider_credential", {
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

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

  private static async baseFetch(
    auth: Authenticator
  ): Promise<ProviderCredentialResource[]> {
    const plan = auth.getNonNullablePlan();
    assert(plan.isByok, "BYOK is not enabled on this workspace's plan.");

    const workspace = auth.getNonNullableWorkspace();

    const models = await this.model.findAll({
      where: { workspaceId: workspace.id },
    });

    return models.map(
      (m) => new ProviderCredentialResource(ProviderCredentialModel, m.get())
    );
  }

  static async listByWorkspace(
    auth: Authenticator
  ): Promise<ProviderCredentialResource[]> {
    return this.baseFetch(auth);
  }

  static async getCredentials(
    auth: Authenticator
  ): Promise<LLMCredentialsType> {
    const plan = auth.getNonNullablePlan();

    if (!plan.isByok) {
      return this.dustManagedLLMCredentials;
    }

    const providerCredentials = await this.baseFetch(auth);

    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

    const oauthCredentials = await concurrentExecutor(
      providerCredentials,
      async (cred) => {
        const credentialRes = await oauthApi.getCredentials({
          credentialsId: cred.credentialId,
        });

        if (credentialRes.isErr()) {
          throw new Error(
            `Failed to fetch OAuth credentials for provider ${cred.providerId}: ${credentialRes.error.message}`
          );
        }

        return {
          providerId: cred.providerId,
          content: credentialRes.value.credential.content,
        };
      },
      { concurrency: 8 }
    );

    return mapOauthCredentialsToLlmCredentials(oauthCredentials);
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    await ProviderCredentialModel.destroy({
      where: { workspaceId: workspace.id },
    });
  }

  async delete(
    auth: Authenticator
  ): Promise<Result<number | undefined, Error>> {
    try {
      const affectedCount = await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });

      return new Ok(affectedCount);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  toJSON(): ProviderCredentialType {
    return {
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      providerId: this.providerId,
      credentialId: this.credentialId,
      isHealthy: this.isHealthy,
      placeholder: this.placeholder,
      editedByUserId: this.editedByUserId,
    };
  }
}

function mapOauthCredentialsToLlmCredentials(
  oauthCredentials: {
    providerId: ModelProviderIdType;
    content: ConnectionCredentials;
  }[]
): LLMCredentialsType {
  const result: LLMCredentialsType = {};

  for (const { providerId, content } of oauthCredentials) {
    if (providerId === "noop") {
      continue;
    }

    switch (providerId) {
      case "openai": {
        const schema = PROVIDER_CREDENTIAL_CONTENT_SCHEMAS[providerId];
        const parsedContent = schema.parse(content);

        result.OPENAI_API_KEY = parsedContent.api_key;
        result.OPENAI_BASE_URL = parsedContent.base_url;
        result.OPENAI_USE_EU_ENDPOINT =
          config.getRegion() === "europe-west1" ? "true" : "false";
        break;
      }
      case "anthropic":
      case "mistral":
      case "google_ai_studio":
      case "deepseek":
      case "fireworks":
      case "xai":
      case "togetherai": {
        const schema = PROVIDER_CREDENTIAL_CONTENT_SCHEMAS[providerId];
        const parsedContent = schema.parse(content);

        result[PROVIDER_TO_CREDENTIAL_KEY[providerId]] = parsedContent.api_key;
        break;
      }
      default:
        assertNever(providerId);
    }
  }

  return result;
}
