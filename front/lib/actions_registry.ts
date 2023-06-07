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
        "eb523129497d094c7986ff6edac16f877ffe2d3ee0149afe9d5e43719cf1e067",
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
        "3620dd97892f5256499100efff0e866e70490517dbb2716db5c0ac151b9ff3bf",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "text-davinci-003",
        use_cache: true,
        use_stream: false,
      },
    },
  },
};

export function cloneBaseConfig(config: { [model: string]: any }) {
  return JSON.parse(JSON.stringify(config));
}
