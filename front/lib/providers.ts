import type { GetProvidersCheckResponseBody } from "@app/pages/api/w/[wId]/providers/[pId]/check";
import type { WorkspaceType } from "@app/types";

import type { useProviders } from "./swr/apps";

type ModelProvider = {
  providerId: string;
  name: string;
  built: boolean;
  enabled: boolean;
  chat: boolean;
  embed: boolean;
};

export const modelProviders: ModelProvider[] = [
  {
    providerId: "openai",
    name: "OpenAI",
    built: true,
    enabled: false,
    chat: true,
    embed: true,
  },
  {
    providerId: "azure_openai",
    name: "Azure OpenAI",
    built: true,
    enabled: false,
    chat: true,
    embed: true,
  },
  {
    providerId: "anthropic",
    name: "Anthropic",
    built: true,
    enabled: false,
    chat: true,
    embed: false,
  },
  {
    providerId: "mistral",
    name: "Mistral AI",
    built: true,
    enabled: false,
    chat: true,
    embed: false, // To enable once we support embeddings on Mistral AI.
  },
  {
    providerId: "google_ai_studio",
    name: "Google AI Studio",
    built: true,
    enabled: false,
    chat: true,
    embed: false,
  },
  {
    providerId: "togetherai",
    name: "TogetherAI",
    built: true,
    enabled: false,
    chat: true,
    embed: false,
  },
  {
    providerId: "deepseek",
    name: "Deepseek",
    built: true,
    enabled: false,
    chat: true,
    embed: false,
  },
  {
    providerId: "fireworks",
    name: "Fireworks",
    built: true,
    enabled: false,
    chat: true,
    embed: false,
  },
  {
    providerId: "xai",
    name: "xAI",
    built: true,
    enabled: false,
    chat: true,
    embed: false,
  },
];

export const APP_MODEL_PROVIDER_IDS: string[] = [
  "openai",
  "anthropic",
  "mistral",
  "google_ai_studio",
  "togetherai",
  "azure_openai",
  "deepseek",
  "fireworks",
  "xai",
] as const;

type ServiceProvider = {
  providerId: string;
  name: string;
  built: boolean;
  enabled: boolean;
};

export const serviceProviders: ServiceProvider[] = [
  {
    providerId: "serpapi",
    name: "SerpApi (Google Search)",
    built: true,
    enabled: false,
  },
  {
    providerId: "serper",
    name: "Serper (Google Search)",
    built: true,
    enabled: false,
  },
  {
    providerId: "browserlessapi",
    name: "Browserless (Web Scrape)",
    built: true,
    enabled: false,
  },
];

export async function checkProvider(
  owner: WorkspaceType,
  providerId: string,
  config: object
): Promise<GetProvidersCheckResponseBody> {
  try {
    const result = await fetch(
      `/api/w/${owner.sId}/providers/${providerId}/check`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config }),
      }
    );
    return await result.json();
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export function filterModelProviders(
  providers: ReturnType<typeof useProviders>["providers"],
  chatOnly: boolean,
  embedOnly: boolean
): ReturnType<typeof useProviders>["providers"] {
  if (!providers) {
    return [];
  }
  const candidateModelProviderIds = new Set(
    modelProviders
      .filter(
        (p) =>
          (!chatOnly || p.chat === true) && (!embedOnly || p.embed === true)
      )
      .map((p) => p.providerId)
  );
  return providers.filter((p) => candidateModelProviderIds.has(p.providerId));
}

export function filterServiceProviders(
  providers: ReturnType<typeof useProviders>["providers"]
): ReturnType<typeof useProviders>["providers"] {
  if (!providers) {
    return [];
  }
  return providers.filter((p) =>
    serviceProviders.map((p) => p.providerId).includes(p.providerId)
  );
}

export async function getProviderLLMModels(
  owner: WorkspaceType,
  providerId: string,
  chat: boolean,
  embed: boolean
): Promise<{ models?: any[]; error?: any }> {
  const modelsRes = await fetch(
    `/api/w/${owner.sId}/providers/${providerId}/models?chat=${chat}&embed=${embed}`
  );
  if (!modelsRes.ok) {
    const err = await modelsRes.json();
    console.log(`Error fetching models for ${providerId}:`, err);
    return { models: [] };
  }
  const models = await modelsRes.json();
  return { models: models.models };
}

const KNOWN_OPENAI_PATTERNS_WITHOUT_STRUCTURED_OUTPUTS_SUPPORT = [
  /^gpt-3\.5-turbo/,
  /^gpt-4(?!o|-\d\.\d)/,
  /^gpt-4o-2024-05-13/,
  /^gpt-4o-mini$/,
  /^o1-/,
  /^transcribe-/,
  /^tts-/,
];

export function supportsResponseFormat(model: {
  provider_id: string;
  model_id: string;
}): boolean {
  // Currently only supporting openai structured outputs
  if (model.provider_id !== "openai") {
    return false;
  }

  // Check for known models that don't support response format.
  // This will not necessarily be holistic of all model families in the future.
  // For future families not in this list that lack support for structured outputs,
  // customers will still see an error message from openai when running the app.
  return !KNOWN_OPENAI_PATTERNS_WITHOUT_STRUCTURED_OUTPUTS_SUPPORT.some(
    (pattern) => pattern.test(model.model_id)
  );
}
