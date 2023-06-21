import { DustAppType } from "./dust_api";

const PRODUCTION_DUST_APPS_WORKSPACE_ID = "78bda07b39";

export const DustProdActionRegistry: {
  [key: string]: { app: DustAppType; config: { [model: string]: any } };
} = {
  "chat-retrieval": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "0d7ab66fd2",
      appHash:
        "63d4bea647370f23fa396dc59347cfbd92354bced26783c9a99812a8b1b14371",
    },
    config: {
      DATASOURCE: {
        data_sources: [],
        top_k: 8,
        filter: { tags: null, timestamp: null },
        use_cache: false,
      },
    },
  },
  "chat-assistant": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "ab43ff2450",
      appHash:
        "5ba93a4b1750336ff15614b16d2f735de444e63ff22ec03f8c6e8b48392e0ea5",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo",
        use_cache: true,
        use_stream: true,
      },
    },
  },
  "chat-title": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "8fe968eef3",
      appHash:
        "528251ebc7b5bc59027877842ca6ff05c64c08765c3ab1f5e1b799395cdb3b57",
    },
    config: {
      TITLE_CHAT: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo-0613",
        function_call: "post_title",
        use_cache: true,
      },
    },
  },
  "gens-query": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "699bfebc61",
      appHash:
        "6d4272ba8a39c333f10ba8ee5e9b228c9d92063cef53e03a89a2f962328f0786",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo-0613",
        function_call: "perform_search",
        use_cache: false,
      },
    },
  },
  "gens-generate": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "98a9f9bc61",
      appHash:
        "f710b3a0107528e89c0b2dbf2e8bea352faa278251e466071f4295191f503919",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-4-0613",
        function_call: "generate_content_block",
        use_cache: false,
        use_stream: true,
      },
    },
  },
  "gens-retrieval": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "60e1004c76",
      appHash:
        "cd4eee76e1c7d46d8219627085dd5d34cb25c6d9214044ae675800ae08a51cc6",
    },
    config: {
      DATASOURCE: {
        data_sources: [],
        top_k: 32,
        filter: { tags: null, timestamp: null },
        use_cache: false,
      },
    },
  },
  "gens-extract": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "9eb5f48bb5",
      appHash:
        "d1c9717e73956f66cc0380fa498032ff13bf2fa35d00b35c2381ed0f0cdea18d",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo",
        use_cache: false,
        use_stream: true,
      },
    },
  },
  "gens-rank": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "2a5aadf425",
      appHash:
        "59b3692527763a970ee4282209e252a63615de7505e5c22bbfa33716add33667",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "text-davinci-003",
        use_cache: false,
        max_tokens: 1,
        top_logprobs: 1,
      },
    },
  },
};

export function cloneBaseConfig(config: { [model: string]: any }) {
  return JSON.parse(JSON.stringify(config));
}
