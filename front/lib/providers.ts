import type {
  AppsModelProviderId,
  ModelProviderIdType,
  WorkspaceType,
} from "@dust-tt/types";
import { APP_MODEL_PROVIDER_IDS, isAppModelProviderType } from "@dust-tt/types";

import logger from "@app/logger/logger";
import type { GetProvidersCheckResponseBody } from "@app/pages/api/w/[wId]/providers/[pId]/check";

import type { useProviders } from "./swr";

type ModelProvider = {
  providerId: AppsModelProviderId;
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
];

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
  { providerId: "gmail", name: "Gmail", built: false, enabled: false },
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
  embedOnly: boolean,
  whiteListedProviders: ModelProviderIdType[] | null
): ReturnType<typeof useProviders>["providers"] {
  if (!providers) {
    return [];
  }
  const providersModels = providers.map((provider) => {
    if (provider && isAppModelProviderType(provider)) {
      return provider;
    } else {
      logger.error("Unexpected type for 'providers'.");
      throw new Error("Unexpected type for 'providers'.");
    }
  });
  const whiteListedAppProviders = new Set(
    whiteListedProviders
      ? [...whiteListedProviders, "azure_openai"]
      : APP_MODEL_PROVIDER_IDS
  );
  const candidateModelProviderIds = new Set(
    modelProviders
      .filter(
        (p) =>
          (!chatOnly || p.chat) &&
          (!embedOnly || p.embed) &&
          whiteListedAppProviders.has(p.providerId)
      )
      .map((p) => p.providerId)
  );
  return providersModels.filter((p) =>
    candidateModelProviderIds.has(p.providerId)
  );
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
