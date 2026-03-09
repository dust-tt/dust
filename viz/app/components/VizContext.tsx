"use client";

import { createContext, useContext } from "react";

interface VizContextValue {
  isPdfMode: boolean;
}

export const VizContext = createContext<VizContextValue>({
  isPdfMode: false,
});

export function useVizContext(): VizContextValue {
  return useContext(VizContext);
}
