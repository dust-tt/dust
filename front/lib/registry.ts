import type { DustAppType } from "@dust-tt/types";

import config, { PRODUCTION_DUST_WORKSPACE_ID } from "@app/lib/api/config";

const DUST_APPS_WORKSPACE_ID = config.getDustAppsWorkspaceId();

export const isProductionDustAppsWorkspaceId = () =>
  PRODUCTION_DUST_WORKSPACE_ID === DUST_APPS_WORKSPACE_ID;

export type Action = {
  app: DustAppType;
  config: { [key: string]: unknown };
};

export const DustProdActionRegistry = {
  "assistant-v2-multi-actions-agent": {
    app: {
      workspaceId: DUST_APPS_WORKSPACE_ID,
      appId: "0e9889c787",
      appHash:
        "4e896f08ef6c2c69c97610c861cd444e3d34c839eab44f9b4fd7dd1d166c40a2",
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
  "assistant-v2-title-generator": {
    app: {
      workspaceId: DUST_APPS_WORKSPACE_ID,
      appId: "84dfc1d4f7",
      appHash:
        "6ea231add2ae690ee959c5d8d5d06420ea2feae7dd32ac13a4e655910087e313",
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
      workspaceId: DUST_APPS_WORKSPACE_ID,
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
      workspaceId: DUST_APPS_WORKSPACE_ID,
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

  "doc-tracker-retrieval": {
    app: {
      workspaceId: DUST_APPS_WORKSPACE_ID,
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
      workspaceId: DUST_APPS_WORKSPACE_ID,
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
      workspaceId: DUST_APPS_WORKSPACE_ID,
      appId: "b4f205e453",
      appHash:
        "1ab6657b93c28ffe8a5c9678e646581cffe69bd4d6b307781a3d576da5acb03e",
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
      workspaceId: DUST_APPS_WORKSPACE_ID,
      appId: "098b515f8e",
      appHash:
        "514d54c0967638656b437417228efec26de465796b5ab67ae0480d6976250768",
    },
    config: { SEARCH: { provider_id: "serpapi", use_cache: false } },
  },
  "assistant-v2-browse": {
    app: {
      workspaceId: DUST_APPS_WORKSPACE_ID,
      appId: "21092925b9",
      appHash:
        "766618e57ff6600cac27d170395c74f4067e8671ef5bf36db5a820fb411f044b",
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
      workspaceId: DUST_APPS_WORKSPACE_ID,
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
      workspaceId: DUST_APPS_WORKSPACE_ID,
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
  "assistant-builder-emoji-suggestions": {
    app: {
      workspaceId: DUST_APPS_WORKSPACE_ID,
      appId: "b69YdlJ3PJ",
      appHash:
        "0b6b63def0224321f2bece0751bad632baca33f6d5bb596bbeb3f95b6bea5966",
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
      workspaceId: DUST_APPS_WORKSPACE_ID,
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
      workspaceId: DUST_APPS_WORKSPACE_ID,
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
  "assistant-v2-visualization": {
    app: {
      workspaceId: DUST_APPS_WORKSPACE_ID,
      appId: "tWcuYDj1OE",
      appHash:
        "8298c6543759d1d11db0e360a8b7aa7b8ec0fa71ed274f2667678302073e4f8d",
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
        use_cache: false,
        use_stream: true,
      },
    },
  },
};

export type DustRegistryActionName = keyof typeof DustProdActionRegistry;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cloneBaseConfig(config: { [model: string]: any }) {
  return JSON.parse(JSON.stringify(config));
}
