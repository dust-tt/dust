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
        "49aa079dc31b9a3fdf53f9ed281d0fa7cb746a578da5dc172ed85b6e116a14f4",
    },
    config: {
      MODEL: {
        provider_id: "openai",
        model_id: "gpt-3.5-turbo",
        use_cache: true,
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
