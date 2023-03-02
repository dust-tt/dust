export const modelProviders = [
  {
    providerId: "openai",
    name: "OpenAI",
    built: true,
    enabled: false,
    chat: true,
  },
  {
    providerId: "cohere",
    name: "Cohere",
    built: true,
    enabled: false,
    chat: false,
  },
  {
    providerId: "ai21",
    name: "AI21 Studio",
    built: true,
    enabled: false,
    chat: false,
  },
  {
    providerId: "hugging_face",
    name: "Hugging Face",
    built: false,
    enabled: false,
    chat: false,
  },
  {
    providerId: "replicate",
    name: "Replicate",
    built: false,
    enabled: false,
    chat: false,
  },
];

export const serviceProviders = [
  {
    providerId: "serpapi",
    name: "SerpApi (Google Search)",
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

export async function checkProvider(providerId, config) {
  try {
    const result = await fetch(
      `/api/providers/${providerId}/check?config=${JSON.stringify(config)}`
    );
    return await result.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function filterModelProviders(providers, chatOnly) {
  if (!providers) return [];
  return providers.filter((p) =>
    modelProviders
      .filter((p) => !chatOnly || p.chat === true)
      .map((p) => p.providerId)
      .includes(p.providerId)
  );
}

export function filterServiceProviders(providers) {
  if (!providers) return [];
  return providers.filter((p) =>
    serviceProviders.map((p) => p.providerId).includes(p.providerId)
  );
}

export async function getProviderLLMModels(providerId, config, chat) {
  let modelsRes = await fetch(
    `/api/providers/${providerId}/models?chat=${chat}`
  );
  if (!modelsRes.ok) {
    let err = await modelsRes.json();
    console.log(`Error fetching models for ${providerId}:`, err);
    return { models: [] };
  }
  let models = await modelsRes.json();
  return { models: models.models };
}

export const credentialsFromProviders = (providers) => {
  let credentials = {};
  providers.forEach((provider) => {
    let config = JSON.parse(provider.config);
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
      case "serpapi":
        credentials["SERP_API_KEY"] = config.api_key;
        break;
      case "browserlessapi":
        credentials["BROWSERLESS_API_KEY"] = config.api_key;
        break;
    }
  });
  return credentials;
};
