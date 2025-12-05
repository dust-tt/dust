import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";

export type ObservabilityMode = "timeRange" | "version";

type ObservabilityContextValue = {
  mode: ObservabilityMode;
  setMode: (m: ObservabilityMode) => void;
  period: ObservabilityTimeRangeType;
  setPeriod: (p: ObservabilityTimeRangeType) => void;
  selectedVersion: AgentVersionMarker | null;
  setSelectedVersion: (v: AgentVersionMarker | null) => void;
};

const ObservabilityContext = createContext<ObservabilityContextValue | null>(
  null
);

export function ObservabilityProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ObservabilityMode>("timeRange");
  const [period, setPeriod] =
    useState<ObservabilityTimeRangeType>(DEFAULT_PERIOD_DAYS);
  const [selectedVersion, setSelectedVersion] =
    useState<AgentVersionMarker | null>(null);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      period,
      setPeriod,
      selectedVersion,
      setSelectedVersion,
    }),
    [mode, period, selectedVersion, setMode, setPeriod, setSelectedVersion]
  );

  return (
    <ObservabilityContext.Provider value={value}>
      {children}
    </ObservabilityContext.Provider>
  );
}

export function useObservabilityContext() {
  const ctx = useContext(ObservabilityContext);
  if (!ctx) {
    throw new Error(
      "useObservabilityContext must be used within an ObservabilityProvider"
    );
  }
  return ctx;
}
