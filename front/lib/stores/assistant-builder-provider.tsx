"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { type StoreApi, useStore as useZustandStore } from "zustand";

import type { Store } from "@app/lib/stores/app";
import { createAssistantBuilderStore } from "./assistantBuilderStore";

export const AssistantStoreBuilder = createContext<StoreApi<Store> | null>(
  null
);

export interface AssistantBuilderProviderProps {
  children: ReactNode;
  initialState: any;
}

export const AssistantBuilderStoreProvider = ({
  children,
  initialState,
}: AssistantBuilderProviderProps) => {
  // this initializes the store only once so it won't be recreated on every render
  const storeRef = useRef<StoreApi<Store>>();
  if (!storeRef.current) {
    storeRef.current = createAssistantBuilderStore(initialState);
  }

  return (
    <AssistantStoreBuilder.Provider value={storeRef.current}>
      {children}
    </AssistantStoreBuilder.Provider>
  );
};

export const useAssistantBuilderStore = <T,>(
  selector: (store: Store) => T
): T => {
  const assistantBuilderStoreContext = useContext(AssistantStoreBuilder);

  if (!assistantBuilderStoreContext) {
    throw new Error("useStore must be use within AssistantBuilderProvider");
  }

  return useZustandStore(assistantBuilderStoreContext, selector);
};

export const useAssistantBuilderActions = () => {
  return useAssistantBuilderStore((state) => state.actions);
};

export const useFlow = () => {
  return useAssistantBuilderStore((state) => state.flow);
};

export const useBuilderState = () => {
  return useAssistantBuilderStore((state) => state.builderState);
};

export const useDefaultScope = () => {
  return useAssistantBuilderStore((state) => state.defaultScope);
};

export const useAgentConfigurationId = () => {
  return useAssistantBuilderStore((state) => state.agentConfigurationId);
};

export const useDefaultTemplate = () => {
  return useAssistantBuilderStore((state) => state.defaultTemplate);
};

export const useIsEdited = () => {
  return useAssistantBuilderStore((state) => state.edited);
};

export const useIsSavingOrDeleting = () => {
  return useAssistantBuilderStore((state) => state.isSavingOrDeleting);
};

export const useDisableUnsavedChangesPrompt = () => {
  return useAssistantBuilderStore((state) => state.disableUnsavedChangesPrompt);
};
