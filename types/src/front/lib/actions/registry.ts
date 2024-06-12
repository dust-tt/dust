import { DustAppType } from "../../../front/lib/dust_api";

const PRODUCTION_DUST_APPS_WORKSPACE_ID = "78bda07b39";

export type Action = {
  app: DustAppType;
  config: { [key: string]: unknown };
};

const createActionRegistry = <K extends string, R extends Record<K, Action>>(
  registry: R
) => registry;

export const DustProdActionRegistry = createActionRegistry({
  "assistant-v2-multi-actions-agent": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "0e9889c787",
      appHash:
        "6ed039ad024172896958070f0487002fb53f9391df4f9d87806d3bc1ebebec6f",
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
        function_call: "auto",
        use_cache: false,
        use_stream: true,
      },
    },
  },
  "assistant-v2-inputs-generator": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "f4816b1e13",
      appHash:
        "96544446491e8f878b3455311e2827f40d6da895db7a6b5f321b972bbeecef54",
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
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
        "c0f71a1ee28895b3c6adb7d78b40a21bb934faa24ec4035bb86921d35788c5e9",
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
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
        "06e0af3c215ee205d2eff01826f763e36f5694c0650bf645ab156ee189e50b3a",
    },
    config: {
      DATASOURCE: {
        data_sources: [],
        top_k: 128,
        filter: { tags: null, parents: null, timestamp: null },
        use_cache: false,
      },
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
        function_call: "extract_data",
        use_cache: false,
      },
    },
  },
  "assistant-v2-generator": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "6a27050429",
      appHash:
        "b0b25be4fb6ed264b4240a61117a940c5b366babaa1e0711218eded7428e0ace",
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
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
        // `provider_id` and `model_id` must be set by caller.
        use_cache: false,
        function_call: "suggest_changes",
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
        // `provider_id` and `model_id` must be set by caller.
        use_cache: false,
        function_call: "execute_sql_query",
      },
    },
  },
  "assistant-v2-websearch": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "098b515f8e",
      appHash:
        "74ece03e8c502d4ae1681847df945248b43b63a0eaa811daed50a3bc81615ac4",
    },
    config: { SEARCH: { provider_id: "serpapi", use_cache: false } },
  },
  "assistant-v2-browse": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "21092925b9",
      appHash:
        "d307f04e3df3c90d000a5525dca6c8688f743a22831994e91d4e20cb469cd1cc",
    },
    config: {
      WEBCONTENT: {
        provider_id: "browserlessapi",
        use_cache: true,
        error_as_output: true,
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
        // `provider_id` and `model_id` must be set by caller.
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
        // `provider_id` and `model_id` must be set by caller.
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
        // `provider_id` and `model_id` must be set by caller.
        function_call: "send_suggestions",
        use_cache: false,
      },
    },
  },
  "assistant-builder-process-action-schema-generator": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "b36c7416bd",
      appHash:
        "1ca7b9568681b06ef6cc0830239a479644a3ecc203c812983f3386a72e214d48",
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
        function_call: "set_extraction_schema",
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
