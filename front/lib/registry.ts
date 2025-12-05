import config from "@app/lib/api/config";

export type ActionApp = {
  workspaceId: string;
  appId: string;
  appHash: string;
  appSpaceId: string;
};

export type Action = {
  app: ActionApp;
  config: { [key: string]: unknown };
};

export type ActionRegistry = Record<DustRegistryActionName, Action>;

export const BaseDustProdActionRegistry = {
  "assistant-v2-multi-actions-agent": {
    app: {
      appId: "0e9889c787",
      appHash:
        "5c66228f878608ea3f74d26c4adabf10e4efe93756b39d82e52a14fe27460b30",
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
  "assistant-v2-retrieval": {
    app: {
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
  "doc-tracker-retrieval": {
    app: {
      appId: "4180309c80",
      appHash:
        "8adcc9ae33a63cc735c9a23a97d7bffe658c6ef2400fc997e61e8817f611a1f8",
    },
    config: {
      SEMANTIC_SEARCH: {
        data_sources: [],
        top_k: 1,
        filter: {
          tags: null,
          timestamp: null,
          parents: null,
        },
        use_cache: false,
        full_text: false,
        target_document_tokens: 2000,
      },
    },
  },
  "doc-tracker-score-docs": {
    app: {
      appId: "N0RrhyTXfq",
      appHash:
        "a5a24fb80df72394a41387a92ccf681d5ee35a90f00941d93200154e30d73b0a",
    },
    config: {
      MODEL: {
        use_cache: true,
      },
    },
  },
  "doc-tracker-suggest-changes": {
    app: {
      appId: "76b40f14fb",
      appHash:
        "5cf8b39da27d1b107c75af833d2ddec8d796ce919eefa10a1aa91779c9cbb33c",
    },
    config: {
      SUGGEST_CHANGES: {
        // `provider_id` and `model_id` must be set by caller.
        use_cache: true,
        function_call: "suggest_changes",
      },
    },
  },
  "assistant-v2-websearch": {
    app: {
      appId: "098b515f8e",
      appHash:
        "514d54c0967638656b437417228efec26de465796b5ab67ae0480d6976250768",
    },
    config: { SEARCH: { provider_id: "serpapi", use_cache: false } },
  },
  "assistant-v2-browse": {
    app: {
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
  "assistant-builder-autocompletion-suggestions": {
    app: {
      appId: "eDoafmNqwn",
      appHash:
        "7dd7f4522a818a5ccbd076972563acf897941752c15616b6135d53ed19195dee",
    },
    config: {
      CREATE_SUGGESTIONS: {
        // `provider_id` and `model_id` must be set by caller.
        function_call: "autocomplete_instructions",
        use_cache: false,
      },
    },
  },
  "assistant-v2-visualization": {
    app: {
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
  "conversation-file-summarizer": {
    app: {
      appId: "iy1pjLCMzZ",
      appHash:
        "0cd0a82dcfaa327b2d5d1f645a314ea885e995a12921a1024ee96b92e8f15768",
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
        use_cache: false,
        use_stream: false,
      },
    },
  },
  "assistant-v2-reason": {
    app: {
      appId: "hUJvIB2KDb",
      appHash:
        "f12559382a92cdd5924f207c5f6cf7e6f74e0a4552a97929958ffc99154fa149",
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

export type DustRegistryActionName = keyof typeof BaseDustProdActionRegistry;

let dustProdActionRegistry: ActionRegistry | undefined;

export const getDustProdActionRegistry = () => {
  if (!dustProdActionRegistry) {
    const workspaceId = config.getDustAppsWorkspaceId();
    const appSpaceId = config.getDustAppsSpaceId();

    dustProdActionRegistry = Object.entries(
      BaseDustProdActionRegistry
    ).reduce<ActionRegistry>(
      (acc, [key, value]) => ({
        ...acc,
        [key]: {
          app: {
            ...value.app,
            workspaceId,
            appSpaceId,
          },
          config: value.config,
        },
      }),
      {} as ActionRegistry
    );
  }

  return dustProdActionRegistry;
};

export const getDustProdAction = (name: DustRegistryActionName) => {
  const registry = getDustProdActionRegistry();
  return registry[name];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cloneBaseConfig(config: { [model: string]: any }) {
  return JSON.parse(JSON.stringify(config));
}
