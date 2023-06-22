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
        top_k: 32,
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
  "chat-assistant-wfn": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "0052be4be7",
      appHash:
        "403342886b5b588530bcd82ba264765329a1f599313d54bd50c62d3c8766b735",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo-16k-0613",
        function_call: "auto",
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
        "4eaab9aaf447fe4d30a7705cd4d83706c0d8b8bed5bbf321a39ed06391f1029a",
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
        "330eec92f79e889fe224562f37945985adc70fd24a62967f0c99dcc49e6333fa",
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
        "1aab1381ac86e22ef50497eefd3fd882846fc786da4f6df248df94b133533120",
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
