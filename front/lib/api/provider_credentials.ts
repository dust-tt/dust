import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import {
  type ApiKeyCredentialContentSchema,
  type LLMCredentialsType,
  PROVIDER_TO_CREDENTIAL_KEY,
} from "@app/types/provider_credential";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { EnvironmentConfig } from "@app/types/shared/utils/config";
import assert from "assert";
import type { z } from "zod";

export async function getLlmCredentials(
  auth: Authenticator,
  { requireEmbeddingApiKey }: { requireEmbeddingApiKey?: boolean } = {}
): Promise<LLMCredentialsType> {
  const plan = auth.getNonNullablePlan();

  if (!plan.isByok) {
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

  const providerCredentials =
    await ProviderCredentialResource.listByWorkspace(auth);

  const credentials = mapOauthCredentialsToLlmCredentials(
    providerCredentials.map((cred) => ({
      providerId: cred.providerId,
      content: cred.credentials,
    }))
  );

  if (requireEmbeddingApiKey) {
    assert(
      credentials.OPENAI_EMBEDDING_API_KEY,
      "[BYOK] This action requires OPENAI_EMBEDDING_API_KEY to be configured."
    );
  }

  return credentials;
}

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
        result.OPENAI_EMBEDDING_API_KEY = content.api_key;
        // TODO(BYOK): add support openai EU host
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
