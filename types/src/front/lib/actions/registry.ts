import { DustAppType } from "../../../front/lib/dust_api";
import { GPT_4_TURBO_MODEL_CONFIG } from "../assistant";

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
        "83dffd37b090ad428fd87f31140e283ac1a1595ca0c69758d184e1c96dc5d4cd",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-4-32k",
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
        "cddc215f2cc07e4a1bdd9c253524ac09667de629420af2570ab1e715fa4ee2b2",
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
        filter: { tags: null, parents: null, timestamp: null },
        use_cache: false,
      },
    },
  },
  "assistant-v2-process": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "953b79fe89",
      appHash:
        "4fed40e920b30417cfd6a67ab206e66d6caf74c9da7e08bc4930a1c76bfae9cb",
    },
    config: {
      DATASOURCE: {
        data_sources: [],
        top_k: 128,
        filter: { tags: null, parents: null, timestamp: null },
        use_cache: false,
      },
    },
  },
  "assistant-v2-generator": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "6a27050429",
      appHash:
        "e0b00417afae51adc7e23c1365850fab154d9b945364c47074ef907915cf8c2c",
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
        model_id: "gpt-4",
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
        model_id: "gpt-4",
        use_cache: false,
        function_call: "extract_events",
      },
    },
  },
  "assistant-v2-query-tables": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "b4f205e453",
      appHash:
        "e8a7693b41b53d2f22379720d173783d669d4a8fb79c8bd302df28a3488f27af",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: GPT_4_TURBO_MODEL_CONFIG.modelId,
        use_cache: false,
        function_call: "execute_sql_query",
      },
    },
  },
  "assistant-builder-instructions-suggestions": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "d995d868a8",
      appHash:
        "7fb9c826d9de74c98de2a675093f66eab9da93a1a2cb9bc0bcc919fd074cd7eb",
    },
    config: {
      CREATE_SUGGESTIONS: {
        provider_id: "openai",
        model_id: GPT_4_TURBO_MODEL_CONFIG.modelId,
        function_call: "send_ranked_suggestions",
        use_cache: false,
      },
    },
  },
  "assistant-builder-name-suggestions": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "34a8c4a2aa",
      appHash:
        "65020161030b555f4d2efc9d1ce3a6d0020dcf76e663f746bd98213c90a0675f",
    },
    config: {
      CREATE_SUGGESTIONS: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo",
        function_call: "send_suggestions",
        use_cache: false,
      },
    },
  },
  "assistant-builder-description-suggestions": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "aba0057f4c",
      appHash:
        "e4bda2ba50f160712c08309628b4a6bf2b68dd7e9709669cc29ac43e36d663f7",
    },
    config: {
      CREATE_SUGGESTIONS: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo",
        function_call: "send_suggestions",
        use_cache: false,
      },
    },
  },
  "assistant-v2-use-tools": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "0e9889c787",
      appHash:
        "388a8ab72120c22d0865fd6fbbaf060b0034f30473c57d2eccb6d866d8297f88",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: GPT_4_TURBO_MODEL_CONFIG.modelId,
        function_call: "auto",
        use_cache: false,
      },
    },
  },
});

export type DustRegistryActionName = keyof typeof DustProdActionRegistry;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cloneBaseConfig(config: { [model: string]: any }) {
  return JSON.parse(JSON.stringify(config));
}
