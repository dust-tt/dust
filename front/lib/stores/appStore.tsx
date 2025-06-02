import { del, get, set } from "idb-keyval";
import { createStore } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

import type { LightAgentConfigurationType } from "@app/types";

export interface AppStoreInitialState {
  userId?: string;
  workspaceId?: string;
  timestamp: number | null;
  actions: {
    setUserId: (userId: string) => void;
    getAgentConfigurationsCache: ({
      userId,
      workspaceId,
    }: {
      userId?: string;
      workspaceId: string;
    }) => LightAgentConfigurationType[];
    setAgentConfigurationsCache: (
      workspaceId: string,
      agentConfigurationsCache: LightAgentConfigurationType[]
    ) => void;
    resetAgentConfigurationsCache: (workspaceId: string) => void;
  };
}

export interface AppStoreState {
  userId?: string;
  workspaceId?: string;
  timestamp: number | null;
  agentConfigurationsCache: LightAgentConfigurationType[];
  actions: {
    setUserId: (userId: string) => void;
    getAgentConfigurationsCache: ({
      userId,
      workspaceId,
    }: {
      userId?: string;
      workspaceId: string;
    }) => LightAgentConfigurationType[];
    setAgentConfigurationsCache: ({
      userId,
      workspaceId,
      agentConfigurationsCache,
    }: {
      userId: string;
      workspaceId: string;
      agentConfigurationsCache: LightAgentConfigurationType[];
    }) => void;
    resetAgentConfigurationsCache: ({
      userId,
      workspaceId,
    }: {
      userId?: string;
      workspaceId: string;
    }) => void;
  };
}

const indexedDBStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

const initialState = {
  userId: undefined,
  workspaceId: undefined,
  timestamp: null,
  agentConfigurationsCache: [],
  actions: {
    setUserId: () => {},
    getAgentConfigurationsCache: () => [],
    setAgentConfigurationsCache: () => {},
    resetAgentConfigurationsCache: () => {},
  },
};

export const createGlobalStateStore = () => {
  return createStore<AppStoreState>()(
    persist(
      devtools((set, get) => ({
        ...initialState,
        agentConfigurationsCache: [],
        actions: {
          setUserId: (userId: string) =>
            set({ userId }, undefined, "setUserId"),
          getAgentConfigurationsCache: ({ userId, workspaceId }) => {
            // if (!userId) {
            //   return [];
            // }

            // const currentCachedUserId = get().userId;
            const currentCachedWorkspaceId = get().workspaceId;

            if (
              // (currentCachedUserId && userId !== get().userId) ||
              currentCachedWorkspaceId &&
              workspaceId !== currentCachedWorkspaceId
            ) {
              get().actions.resetAgentConfigurationsCache({
                userId: userId || "",
                workspaceId,
              });
              return [];
            }

            const currentTimestamp = Date.now();
            const lastSavedTimestamp = get().timestamp;

            // if it's more than 7 days old (TBD), let it expire.
            if (
              lastSavedTimestamp &&
              currentTimestamp - lastSavedTimestamp > 1000 * 60 * 60 * 24 * 7
            ) {
              get().actions.resetAgentConfigurationsCache({
                userId,
                workspaceId,
              });
              return [];
            }

            return get().agentConfigurationsCache;
          },
          setAgentConfigurationsCache: ({
            // userId,
            workspaceId,
            agentConfigurationsCache,
          }) =>
            set(
              () => {
                // if (!userId) {
                //   return initialState;
                // }

                const currentTimestamp = Date.now();

                return {
                  // userId,
                  workspaceId,
                  agentConfigurationsCache,
                  timestamp: currentTimestamp,
                };
              },
              undefined,
              "setAgentConfigurationsCache"
            ),
          resetAgentConfigurationsCache: ({ userId, workspaceId }) =>
            set(
              {
                userId,
                workspaceId,
                agentConfigurationsCache: [],
                timestamp: null,
              },
              undefined,
              "resetAgentConfigurationsCache"
            ),
          resetStore: () => {
            set(initialState); // We should reset on logout?
          },
        },
      })),
      {
        name: "global-store",
        storage: createJSONStorage(() => indexedDBStorage),
        version: 0,
        partialize: (state) => ({
          userId: state.userId,
          workspaceId: state.workspaceId,
          timestamp: state.timestamp,
          agentConfigurationsCache: state.agentConfigurationsCache,
        }), // This is used to persist the state to the storage
        onRehydrateStorage: (state) => {
          // optional
          return (state, error) => {
            if (error) {
              console.log("an error happened during hydration", error);
            } else {
              console.log("state", state);
              console.log("hydration finished");
            }
          };
        },
      }
    )
  );
};
