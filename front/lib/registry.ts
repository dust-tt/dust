import { isDevelopment } from "@dust-tt/types";

import config from "@app/lib/api/config";

export const PRODUCTION_DUST_WORKSPACE_ID = "0ec9852c2f";
export const PRODUCTION_DUST_APPS_WORKSPACE_ID = "78bda07b39";
export const PRODUCTION_DUST_APPS_VAULT_ID = "vlt_rICtlrSEpWqX";
export const PRODUCTION_DUST_APPS_HELPER_DATASOURCE_VIEW_ID =
  "dsv_artLN7ZRrKWB";
export type Action = {
  app: {
    workspaceId: string;
    appId: string;
    appHash: string;
    appVaultId: string;
  };
  config: { [key: string]: unknown };
};

const createActionRegistry = <K extends string, R extends Record<K, Action>>(
  registry: R
) => {
  const developmentWorkspaceId = config.getDevelopmentDustAppsWorkspaceId();
  const developmentVaultId = config.getDevelopmentDustAppsVaultId();

  if (isDevelopment() && developmentWorkspaceId) {
    if (!developmentVaultId) {
      throw new Error(
        "DEVELOPMENT_DUST_APPS_VAULT_ID must be set in development if DEVELOPMENT_DUST_APPS_WORKSPACE_ID is set"
      );
    }
    const actions: Action[] = Object.values(registry);
    actions.forEach((action) => {
      action.app.workspaceId = developmentWorkspaceId;
      action.app.appVaultId = developmentVaultId;
    });
  }

  return registry;
};

export const DustProdActionRegistry = createActionRegistry({
  "assistant-v2-multi-actions-agent": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "0e9889c787",
      appHash:
        "4e896f08ef6c2c69c97610c861cd444e3d34c839eab44f9b4fd7dd1d166c40a2",
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "84dfc1d4f7",
      appHash:
        "6ea231add2ae690ee959c5d8d5d06420ea2feae7dd32ac13a4e655910087e313",
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "4180309c80",
      appHash:
        "8adcc9ae33a63cc735c9a23a97d7bffe658c6ef2400fc997e61e8817f611a1f8",
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
        "d2bfd8d38ad3fa5f71fb7c95cdd9eed158ae3b25f737cb27b8fa3e2d344388ce",
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
        "514d54c0967638656b437417228efec26de465796b5ab67ae0480d6976250768",
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
    },
    config: { SEARCH: { provider_id: "serpapi", use_cache: false } },
  },
  "assistant-v2-browse": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "21092925b9",
      appHash:
        "766618e57ff6600cac27d170395c74f4067e8671ef5bf36db5a820fb411f044b",
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "b69YdlJ3PJ",
      appHash:
        "0b6b63def0224321f2bece0751bad632baca33f6d5bb596bbeb3f95b6bea5966",
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
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
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "tWcuYDj1OE",
      appHash:
        "8298c6543759d1d11db0e360a8b7aa7b8ec0fa71ed274f2667678302073e4f8d",
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
        use_cache: false,
        use_stream: true,
      },
    },
  },
  "table-header-detection": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "Hllp6rDlNo",
      appHash:
        "99f72c76477abd761f33d693b13c8d98750b2e80a68d24eb8963de777a77ebdc",
      appVaultId: PRODUCTION_DUST_APPS_VAULT_ID,
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
        use_cache: false,
        use_stream: true,
      },
    },
  },
});

export type DustRegistryActionName = keyof typeof DustProdActionRegistry;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cloneBaseConfig(config: { [model: string]: any }) {
  return JSON.parse(JSON.stringify(config));
}
