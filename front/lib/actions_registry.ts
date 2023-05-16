import { DustAppType } from "./dust_api";

const PRODUCTION_DUST_APPS_WORKSPACE_ID = "78bda07b39";

export const DustProdActionRegistry: {
  [key: string]: { app: DustAppType; config: { [model: string]: any } };
} = {
  "chat-main": {
    app: {
      workspaceId: PRODUCTION_DUST_APPS_WORKSPACE_ID,
      appId: "6fe1383f11",
      appHash:
        "9fb98ce023ca56394c063802d3d96097dba3dee5d26c5e0ddeb1f4a0268f7d6b",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo",
        use_cache: true,
        use_stream: true,
      },
      DATASOURCE: {
        data_sources: [],
        top_k: 8,
        filter: { tags: null, timestamp: null },
        use_cache: false,
      },
    },
  },
};

export function cloneBaseConfig(config: { [model: string]: any }) {
  return JSON.parse(JSON.stringify(config));
}
