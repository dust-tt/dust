"use client";

import type {
  EditTextFn,
  VisualizationUIAPI,
} from "@viz/app/lib/visualization-api";
import { createContext, useContext } from "react";

interface VizContextValue {
  isPdfMode: boolean;
  editText: EditTextFn | null;
  /** Origin-validated parent→viz listener from VisualizationWrapper. */
  addEventListener: VisualizationUIAPI["addEventListener"] | null;
}

export const VizContext = createContext<VizContextValue>({
  isPdfMode: false,
  editText: null,
  addEventListener: null,
});

export function useVizContext(): VizContextValue {
  return useContext(VizContext);
}
