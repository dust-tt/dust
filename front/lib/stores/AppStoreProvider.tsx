import type { ReactNode } from "react";
import { createContext, useContext, useRef } from "react";
import type { StoreApi } from "zustand";
import { useStore as useZustandStore } from "zustand";

import type { AppStoreState } from "@app/lib/stores/appStore";
import { createGlobalStateStore } from "@app/lib/stores/appStore";

export const AppStoreContext = createContext<StoreApi<AppStoreState> | null>(
  null
);

export interface AppStoreProviderProps {
  children: ReactNode;
}

export const AppStoreProvider = ({ children }: AppStoreProviderProps) => {
  // this initializes the store only once so it won't be recreated on every render
  const storeRef = useRef<StoreApi<AppStoreState>>();
  if (!storeRef.current) {
    storeRef.current = createGlobalStateStore();
  }

  return (
    <AppStoreContext.Provider value={storeRef.current}>
      {children}
    </AppStoreContext.Provider>
  );
};

// If you want to select multiple states, you can do like this
// useAppStore((state) => {state.userId, state.workspaceId}).
export const useAppStore = <T,>(selector: (state: AppStoreState) => T): T => {
  const context = useContext(AppStoreContext);

  if (!context) {
    throw new Error("useAppStore must be use within AppStoreProvider");
  }

  // I'm sure there must be a better way than this??
  if (selector.toString() === "(state)=>state") {
    throw new Error(
      "Accessing the whole state is not allowed. Please select specific properties instead."
    );
  }
  return useZustandStore(context, selector);
};
