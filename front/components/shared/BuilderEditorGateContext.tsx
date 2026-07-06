import type { ReactNode } from "react";
import { createContext, useContext } from "react";

export interface BuilderEditorGateContextType {
  isEditorGateVisible: boolean;
  isAddingSelfAsEditor: boolean;
  onAddSelfAsEditor: () => Promise<void>;
}

const BuilderEditorGateContext =
  createContext<BuilderEditorGateContextType | null>(null);

interface BuilderEditorGateProviderProps {
  value: BuilderEditorGateContextType;
  children: ReactNode;
}

export function BuilderEditorGateProvider({
  value,
  children,
}: BuilderEditorGateProviderProps) {
  return (
    <BuilderEditorGateContext.Provider value={value}>
      {children}
    </BuilderEditorGateContext.Provider>
  );
}

export function useBuilderEditorGate() {
  const context = useContext(BuilderEditorGateContext);
  if (!context) {
    throw new Error(
      "useBuilderEditorGate must be used within a BuilderEditorGateProvider"
    );
  }
  return context;
}
