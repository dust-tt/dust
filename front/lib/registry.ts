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
        "4ca72349dd72e1140d47efe96eda954e0e7b2cea2c36088b6da0ca083b23c3e2",
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
      appId: "953b79fe89",
      appHash:
        "689c0cde9d4962a57b5a38caab6244fdd4b30ce5e52af0f40333a03a847a91f1",
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
  "assistant-v2-query-tables": {
    app: {
      appId: "b4f205e453",
      appHash:
        "241a3f26bf8fcec4d728583420ad4424dcdf2e9554b6d1180affbdba49bf30b7",
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
        use_cache: false,
        function_call: "execute_query",
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
  "assistant-builder-instructions-suggestions": {
    app: {
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
  "assistant-builder-tags-suggestions": {
    app: {
      appId: "7mjFTd4e45",
      appHash:
        "430bb302f09d43230f5772f700c7f9823d18be44dd264e002a9d67849ab13d02",
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
      appId: "b36c7416bd",
      appHash:
        "decdb1f2c554b78fee580f826adefc06fac9c936a3c71980d5cdf81aa33bdcc8",
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
  "suggest-agent-from-message": {
    app: {
      appId: "fcYLVzSHdU",
      appHash:
        "b988e0a0b7c347edcfc5f263a0fff591fe4a8cd643ab9480a8bfdd5d79fca6c9",
    },
    config: {
      MODEL: {
        // `provider_id` and `model_id` must be set by caller.
        function_call: "suggest_agents",
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
