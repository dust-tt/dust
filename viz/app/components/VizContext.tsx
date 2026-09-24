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
  /**
   * When true (Frames v2 Edit session), text activates on click and supports FLUSH_EDITABLES.
   * When false (legacy), activation is double-click with immediate blur-save like main.
   */
  stagedEdits: boolean;
}

export const VizContext = createContext<VizContextValue>({
  isPdfMode: false,
  editText: null,
  addEventListener: null,
  stagedEdits: false,
});

export function useVizContext(): VizContextValue {
  return useContext(VizContext);
}
