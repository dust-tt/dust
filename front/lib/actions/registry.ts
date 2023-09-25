import { DustAppType } from "@app/lib/dust_api";

const PRODUCTION_DUST_APPS_WORKSPACE_ID = "78bda07b39";

export type Action = {
  app: DustAppType;
  config: { [key: string]: unknown };
};

const createActionRegistry = <K extends string, R extends Record<K, Action>>(
  registry: R
) => registry;

export const DustProdActionRegistry = createActionRegistry({
  "assistant-v2-inputs-generator": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "f4816b1e13",
      appHash:
        "f24ac7033d61b371be1473ddf9a6946513dda65c8b58b66aff182a73c171916f",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo-16k",
        function_call: "auto",
        use_cache: false,
      },
    },
  },
  "assistant-v2-title-generator": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "84dfc1d4f7",
      appHash:
        "b7b8a87fde20d0302dfc13e80f147a5dc1967bb9795f55a47428b92936e5cdec",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo-16k",
        function_call: "update_title",
        use_cache: false,
      },
    },
  },
  "assistant-v2-retrieval": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "471b6aa923",
      appHash:
        "3b634a84930020a7a18d3b32f4c5f5cd85690bf4958127ba51061fb101edea33",
    },
    config: {
      DATASOURCE: {
        data_sources: [],
        top_k: 32,
        filter: { tags: null, parent: null, timestamp: null },
        use_cache: false,
      },
    },
  },
  "assistant-v2-generator": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "6a27050429",
      appHash:
        "efa092ecb7b337d2ed78ab9d3c9ff6204ef95af044b0258c0d220866666bdf6b",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-4",
        function_call: null,
        use_cache: false,
        use_stream: true,
      },
    },
  },

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
        "e2291ceaa774bf3a05d1c3a20db6b6de613070ae683704d6e3076d2711755d81",
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
        "f676a2de5b83bdbd02b55beaefddafb0bb16f53715d9d7ba3c219ec09b6b0588",
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
  "doc-tracker-retrieval": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "4180309c80",
      appHash:
        "8adcc9ae33a63cc735c9a23a97d7bffe658c6ef2400fc997e61e8817f611a1f8",
    },
    config: {
      SEMANTIC_SEARCH: {
        data_sources: [],
        // top k will probably need to be
        // proportional to the number of documents
        top_k: 64,
        filter: {
          tags: null,
          timestamp: null,
        },
        use_cache: false,
        full_text: false,
        target_document_tokens: 2000,
      },
    },
  },
  "doc-tracker-suggest-changes": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "76b40f14fb",
      appHash:
        "93877e16b59a07eff3b4f154b8f568f172d6a463f27bd3bcbf5f6aa264216163",
    },
    config: {
      SUGGEST_CHANGES: {
        provider_id: "openai",
        model_id: "gpt-4-0613",
        use_cache: false,
        function_call: "suggest_changes",
      },
    },
  },
  "extract-events": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "d4f31b6a63",
      appHash:
        "65304e44043046ff37dd85e98b31557f21937a6b0b468fbfa2eb4bf424f1cc0d",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-4-0613",
        use_cache: false,
        function_call: "extract_events",
      },
    },
  },
});

export type DustRegistryActionName = keyof typeof DustProdActionRegistry;

export function isDustRegistryActionName(
  name: string
): name is DustRegistryActionName {
  return !!DustProdActionRegistry[name as DustRegistryActionName];
}

export function cloneBaseConfig(config: { [model: string]: any }) {
  return JSON.parse(JSON.stringify(config));
}
