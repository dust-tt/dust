"use client";

import type { EditTextFn } from "@viz/app/lib/visualization-api";
import { createContext, useContext } from "react";

interface VizContextValue {
  /** Host-controlled editability; shared views never enable it. */
  isEditable: boolean;
  isPdfMode: boolean;
  editText: EditTextFn | null;
}

export const VizContext = createContext<VizContextValue>({
  isEditable: false,
  isPdfMode: false,
  editText: null,
});

export function useVizContext(): VizContextValue {
  return useContext(VizContext);
}
