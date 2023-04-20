import { GetProvidersCheckResponseBody } from "@app/pages/api/w/[wId]/providers/[pId]/check";
import { WorkspaceType } from "@app/types/user";

import { useProviders } from "./swr";

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
    providerId: "cohere",
    name: "Cohere",
    built: true,
    enabled: false,
    chat: false,
    embed: false,
  },
  {
    providerId: "ai21",
    name: "AI21 Studio",
    built: true,
    enabled: false,
    chat: false,
    embed: false,
  },
  {
    providerId: "azure_openai",
    name: "Azure OpenAI",
    built: true,
    enabled: false,
    chat: false,
    embed: true,
  },
  {
    providerId: "anthropic",
    name: "Anthropic",
    built: true,
    enabled: false,
    chat: false,
    embed: false,
  },
  {
    providerId: "hugging_face",
    name: "Hugging Face",
    built: false,
    enabled: false,
    chat: false,
    embed: false,
  },
  {
    providerId: "replicate",
    name: "Replicate",
    built: false,
    enabled: false,
    chat: false,
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
  {
    providerId: "youtube",
    name: "YouTube Search",
    built: false,
    enabled: false,
  },
  { providerId: "notion", name: "Notion", built: false, enabled: false },
  { providerId: "gmail", name: "Gmail", built: false, enabled: false },
];

export async function checkProvider(
  owner: WorkspaceType,
  providerId: string,
  config: object
): Promise<GetProvidersCheckResponseBody> {
  try {
    const result = await fetch(
      `/api/w/${
        owner.sId
      }/providers/${providerId}/check?config=${JSON.stringify(config)}`
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
  if (!providers) return [];
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
  if (!providers) return [];
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
  let modelsRes = await fetch(
    `/api/w/${owner.sId}/providers/${providerId}/models?chat=${chat}&embed=${embed}`
  );
  if (!modelsRes.ok) {
    let err = await modelsRes.json();
    console.log(`Error fetching models for ${providerId}:`, err);
    return { models: [] };
  }
  let models = await modelsRes.json();
  return { models: models.models };
}

type Credentials = {
  OPENAI_API_KEY?: string;
  COHERE_API_KEY?: string;
  AI21_API_KEY?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  ANTHROPIC_API_KEY?: string;
  SERP_API_KEY?: string;
  SERPER_API_KEY?: string;
  BROWSERLESS_API_KEY?: string;
};

export const credentialsFromProviders = (
  providers: { providerId: string; config: string }[]
): Credentials => {
  let credentials: Credentials = {};

  providers.forEach((provider) => {
    let config = JSON.parse(provider.config) as {
      api_key: string;
      endpoint?: string;
    };

    switch (provider.providerId) {
      case "openai":
        credentials["OPENAI_API_KEY"] = config.api_key;
        break;
      case "cohere":
        credentials["COHERE_API_KEY"] = config.api_key;
        break;
      case "ai21":
        credentials["AI21_API_KEY"] = config.api_key;
        break;
      case "azure_openai":
        credentials["AZURE_OPENAI_API_KEY"] = config.api_key;
        credentials["AZURE_OPENAI_ENDPOINT"] = config.endpoint;
        break;
      case "anthropic":
        credentials["ANTHROPIC_API_KEY"] = config.api_key;
      case "serpapi":
        credentials["SERP_API_KEY"] = config.api_key;
        break;
      case "serper":
        credentials["SERPER_API_KEY"] = config.api_key;
        break;
      case "browserlessapi":
        credentials["BROWSERLESS_API_KEY"] = config.api_key;
        break;
    }
  });
  return credentials;
};
