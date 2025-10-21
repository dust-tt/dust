import { createContext, useContext, useState } from "react";

import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";

type ObservabilityContextValue = {
  period: ObservabilityTimeRangeType;
  setPeriod: (p: ObservabilityTimeRangeType) => void;
};

const ObservabilityContext = createContext<ObservabilityContextValue | null>(
  null
);

export function ObservabilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [period, setPeriod] =
    useState<ObservabilityTimeRangeType>(DEFAULT_PERIOD_DAYS);

  return (
    <ObservabilityContext.Provider value={{ period, setPeriod }}>
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
