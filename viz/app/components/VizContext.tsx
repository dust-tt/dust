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
   * When true (Frames v2), text uses click-to-edit + FLUSH_EDITABLES once Edit mode is active.
   * When false (legacy), activation is double-click with immediate blur-save like main.
   */
  stagedEdits: boolean;
  /**
   * Frames v2 Preview|Edit: affordances are off in Preview and on in Edit without remounting.
   * Legacy ignores this (always interactive when EditableFrame is mounted).
   */
  editModeActive: boolean;
}

export const VizContext = createContext<VizContextValue>({
  isPdfMode: false,
  editText: null,
  addEventListener: null,
  stagedEdits: false,
  editModeActive: false,
});

export function useVizContext(): VizContextValue {
  return useContext(VizContext);
}
