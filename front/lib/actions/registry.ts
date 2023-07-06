import { DustAppType } from "@app/lib/dust_api";

const PRODUCTION_DUST_APPS_WORKSPACE_ID = "78bda07b39";

export type Action = {
  app: DustAppType;
  config: { [key: string]: unknown };
};

export const DustProdActionRegistry: {
  [key: string]: Action;
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
        top_k: 16,
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
        "2e9a8dbea83076c23d235f1dce273570542c4f11e9a0e7decefa9c26c78654e9",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-4-0613",
        function_call: "auto",
        use_cache: true,
        use_stream: true,
      },
    },
  },
  "chat-message-e2e-eval": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "201e6de608",
      appHash:
        "7b56ae8ab505867c3822421bd9ddab6e4a68f993c4b7532ff4125cc9a79ff4a0",
    },
    config: {
      RULE_VALIDITY: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo-0613",
        function_call: "send_rule_validity",
        use_cache: true,
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
  "gens-time-range": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "699bfebc61",
      appHash:
        "2e432b4d35b625a5c2ac38813c689b6f3d3a94edc27f74bfb238c69dfe0354d8",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-4-0613",
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
        "b11c07d4700d3154dc56e528cf9f5e8b2d25d89526a6b0869015d4f3fbcea42d",
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
        "53d7e57c3ce800dcc73b669a20434a0e8e1391ef3988fea482cf3143fdda27f3",
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
  "gens-summary": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "6a7495bf9f",
      appHash:
        "c1522e77be98e0279110bed06c7540ab1fc324cd2b9ebfb78a76b8a2fcd30425",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo-0613",
        use_cache: false,
        use_stream: true,
        function_call: "return_summary",
      },
    },
  },
  "gens-rank": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "2a5aadf425",
      appHash:
        "51f019d2b20c9aad93f26189790ed3f82be0d126b1f18545a2f837622215a6d5",
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
  "doc-tracker": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "a48139b64b",
      appHash:
        "8fbdd063ae0e45ced9dcb5771200b171f1987124c4b7671a66d8eef5e4a1d9ac",
    },
    config: {
      SUGGEST_CHANGES: {
        provider_id: "openai",
        model_id: "gpt-4-0613",
        use_cache: false,
        function_call: "suggest_changes",
      },
      SEMANTIC_SEARCH: {
        data_sources: [],
        top_k: 8,
        filter: {
          tags: {
            in: ["__DUST_TRACKED"],
            not: null,
          },
          timestamp: null,
        },
        use_cache: false,
        full_text: true,
      },
      SUMMARIZE_INCOMING_DOC: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo-0613",
        function_call: "return_summary",
        use_cache: false,
      },
    },
  },
};

export function cloneBaseConfig(config: { [model: string]: any }) {
  return JSON.parse(JSON.stringify(config));
}
