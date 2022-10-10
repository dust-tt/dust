export const modelProviders = [
  {
    providerId: "openai",
    name: "OpenAI",
    built: true,
    enabled: false,
  },
  {
    providerId: "cohere",
    name: "Cohere",
    built: true,
    enabled: false,
  },
  {
    providerId: "hugging_face",
    name: "HuggingFace",
    built: false,
    enabled: false,
  },
  {
    providerId: "replicate",
    name: "Replicate",
    built: false,
    enabled: false,
  },
];

export const serviceProviders = [
  {
    providerId: "google_search",
    name: "Google Search",
    built: false,
    enabled: false,
  },
  {
    providerId: "youtube",
    name: "Youtube Search",
    built: false,
    enabled: false,
  },
  { providerId: "notion", name: "Notion", built: false, enabled: false },
  { providerId: "gmail", name: "GMail", built: false, enabled: false },
];

export async function checkProvider(providerId, config) {
  switch (providerId) {
    case "openai":
      let modelsRes = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.api_key}`,
        },
      });
      if (!modelsRes.ok) {
        let err = await modelsRes.json();
        return { ok: false, error: err.error.code };
      } else {
        let models = await modelsRes.json();
        return { ok: true };
      }
      break;

    case "cohere":
      let testRes = await fetch("https://api.cohere.ai/tokenize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: "Hello World" }),
      });
      if (!testRes.ok) {
        let err = await testRes.json();
        return { ok: false, error: err.message };
      } else {
        let test = await testRes.json();
        return { ok: true };
      }
      break;

    default:
      return { ok: false, error: "Provider not built" };
      break;
  }
}

export function filterModelProviders(providers) {
  if (!providers) return [];
  return providers.filter((p) =>
    modelProviders.map((p) => p.providerId).includes(p.providerId)
  );
}

export function filterServiceProviders(providers) {
  if (!providers) return [];
  return providers.filter((p) =>
    serviceProviders.map((p) => p.providerId).includes(p.providerId)
  );
}

export async function getProviderLLMModels(providerId, config) {
  switch (providerId) {
    case "openai":
      let modelsRes = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.api_key}`,
        },
      });
      if (!modelsRes.ok) {
        let err = await modelsRes.json();
        return { models: [] };
      } else {
        let models = await modelsRes.json();
        let f = models.data.filter((m) => {
          return (
            !(
              m.id.includes("search") ||
              m.id.includes("similarity") ||
              m.id.includes("edit") ||
              m.id.includes("insert") ||
              m.id.includes("audio") ||
              m.id.includes(":")
            ) &&
            (m.id.startsWith("text-") || m.id.startsWith("code-"))
          );
        });
        f.sort((a, b) => {
          if (a.id < b.id) {
            return -1;
          }
          if (a.id > b.id) {
            return 1;
          }
          return 0;
        });
        return {
          models: f,
        };
      }
      break;
    case "cohere":
      let models = [
        { id: "xlarge" },
        { id: "large" },
        { id: "medium" },
        { id: "small" },
      ];
      return { models: models };
      break;
    default:
      return { models: [{ id: "not_found" }] };
      break;
  }
}
