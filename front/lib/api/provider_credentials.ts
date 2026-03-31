import config from "@app/lib/api/config";

import type { Authenticator } from "@app/lib/auth";
import { isByokTransitioningPlan } from "@app/lib/plans/plan_codes";
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

// Fraction of requests that use BYOK credentials during the transition period.
const BYOK_TRANSITION_BYOK_KEYS_RATIO = 0.2; // 20%

/**
 * Returns LLM credentials for the workspace.
 *
 * - Non-BYOK workspaces: returns Dust-managed keys from environment variables.
 * - BYOK workspaces: resolves customer-provided keys from OAuth credentials.
 *   - For BYOK_TRANSITIONING plan, fallback on Dust-managed keys if customer keys are not provided.
 *   - For all others, do not fallback.
 *
 * `OPENAI_EMBEDDING_API_KEY` is set separately from `OPENAI_API_KEY` so Dust apps
 * don't accidentally use the customer's LLM key for embeddings.
 *
 * By default, BYOK workspaces must have `OPENAI_EMBEDDING_API_KEY` configured
 * (used by search, upsert, data source creation).
 * Pass `skipEmbeddingApiKeyRequirement: true` for call sites that only need LLM
 * keys (agent loop, token counting, image generation, etc.).
 */
export async function getLlmCredentials(
  auth: Authenticator,
  { skipEmbeddingApiKeyRequirement } = {
    skipEmbeddingApiKeyRequirement: false,
  }
): Promise<LLMCredentialsType> {
  const plan = auth.getNonNullablePlan();

  const env = (key: string) =>
    EnvironmentConfig.getOptionalEnvVariable(key) ?? "";

  const DUST_MANAGED_BYOK_PROVIDERS_API_KEYS = {
    ANTHROPIC_API_KEY: env("DUST_MANAGED_ANTHROPIC_API_KEY"),
    OPENAI_API_KEY: env("DUST_MANAGED_OPENAI_API_KEY"),
  };

  const DUST_MANAGED_OTHER_PROVIDERS_API_KEYS = {
    AZURE_OPENAI_API_KEY: env("DUST_MANAGED_AZURE_OPENAI_API_KEY"),
    AZURE_OPENAI_ENDPOINT: env("DUST_MANAGED_AZURE_OPENAI_ENDPOINT"),
    MISTRAL_API_KEY: env("DUST_MANAGED_MISTRAL_API_KEY"),
    TEXTSYNTH_API_KEY: env("DUST_MANAGED_TEXTSYNTH_API_KEY"),
    GOOGLE_AI_STUDIO_API_KEY: env("DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY"),
    TOGETHERAI_API_KEY: env("DUST_MANAGED_TOGETHERAI_API_KEY"),
    DEEPSEEK_API_KEY: env("DUST_MANAGED_DEEPSEEK_API_KEY"),
    FIREWORKS_API_KEY: env("DUST_MANAGED_FIREWORKS_API_KEY"),
    XAI_API_KEY: env("DUST_MANAGED_XAI_API_KEY"),
  };

  // Safer to always point to the same hosting region while we handle US first,
  // avoid region switching issues when welcoming EU BYOK workspaces later.
  const BASE_VARIABLES = {
    OPENAI_USE_EU_ENDPOINT:
      config.getRegion() === "europe-west1" ? "true" : "false",
    OPENAI_BASE_URL: env("DUST_MANAGED_OPENAI_BASE_URL"),
  };

  if (!plan.isByok) {
    return {
      ...BASE_VARIABLES,
      ...DUST_MANAGED_OTHER_PROVIDERS_API_KEYS,
      ...DUST_MANAGED_BYOK_PROVIDERS_API_KEYS,
    };
  }

  const providerCredentials =
    await ProviderCredentialResource.listByWorkspace(auth);

  // Use healthy keys only and fallback on Dust keys for this specific plan only
  if (isByokTransitioningPlan(plan)) {
    const healthyCredentials = mapOauthCredentialsToLlmCredentials(
      providerCredentials
        .filter(({ isHealthy }) => isHealthy)
        .map((cred) => ({
          providerId: cred.providerId,
          content: cred.credentials,
        }))
    );

    const shouldUseByokKeys = Math.random() < BYOK_TRANSITION_BYOK_KEYS_RATIO;

    return shouldUseByokKeys
      ? {
          ...BASE_VARIABLES,
          ...DUST_MANAGED_BYOK_PROVIDERS_API_KEYS,
          ...healthyCredentials,
        }
      : { ...BASE_VARIABLES, ...DUST_MANAGED_BYOK_PROVIDERS_API_KEYS };
  }

  const credentials = mapOauthCredentialsToLlmCredentials(
    providerCredentials.map((cred) => ({
      providerId: cred.providerId,
      content: cred.credentials,
    }))
  );

  if (!skipEmbeddingApiKeyRequirement) {
    assert(
      credentials.OPENAI_EMBEDDING_API_KEY,
      "[BYOK] This action requires OPENAI_EMBEDDING_API_KEY to be configured."
    );
  }

  return {
    ...BASE_VARIABLES,
    ...credentials,
  };
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
