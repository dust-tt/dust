"use client";

import { createContext, useContext } from "react";

interface VizContextValue {
  isPdfMode: boolean;
  editText:
    | ((oldText: string, newText: string) => Promise<{ success: boolean }>)
    | null;
}

export const VizContext = createContext<VizContextValue>({
  isPdfMode: false,
  editText: null,
});

export function useVizContext(): VizContextValue {
  return useContext(VizContext);
}
