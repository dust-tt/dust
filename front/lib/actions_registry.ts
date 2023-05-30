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
        "3f64c7b8d4bad05db5d880ca5ffb66f7107a5c178ed43e360fd31634269bc01f",
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
        "df8a90a50ac4b9b4109dcc56c16e40f40b65dd43e0289a15d3f1a416e5feaabd",
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
};

export function cloneBaseConfig(config: { [model: string]: any }) {
  return JSON.parse(JSON.stringify(config));
}
