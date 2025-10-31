import { createContext, useContext, useState } from "react";

import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";

export type ObservabilityMode = "timeRange" | "version";

type ObservabilityContextValue = {
  mode: ObservabilityMode;
  setMode: (m: ObservabilityMode) => void;
  period: ObservabilityTimeRangeType;
  setPeriod: (p: ObservabilityTimeRangeType) => void;
  selectedVersion: string | null;
  setSelectedVersion: (v: string | null) => void;
};

const ObservabilityContext = createContext<ObservabilityContextValue | null>(
  null
);

export function ObservabilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<ObservabilityMode>("timeRange");
  const [period, setPeriod] =
    useState<ObservabilityTimeRangeType>(DEFAULT_PERIOD_DAYS);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  return (
    <ObservabilityContext.Provider
      value={{
        mode,
        setMode,
        period,
        setPeriod,
        selectedVersion,
        setSelectedVersion,
      }}
    >
      {children}
    </ObservabilityContext.Provider>
  );
}

export function useObservability() {
  const ctx = useContext(ObservabilityContext);
  if (!ctx) {
    throw new Error(
      "useObservability must be used within an ObservabilityProvider"
    );
  }
  return ctx;
}
