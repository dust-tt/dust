"use client";

import type { EditTextFn } from "@viz/app/lib/visualization-api";
import { createContext, useContext } from "react";

interface VizContextValue {
  isPdfMode: boolean;
  editText: EditTextFn | null;
}

export const VizContext = createContext<VizContextValue>({
  isPdfMode: false,
  editText: null,
});

export function useVizContext(): VizContextValue {
  return useContext(VizContext);
}
