"use client";

import type {
  EditTextFn,
  VisualizationUIAPI,
} from "@viz/app/lib/visualization-api";
import { createContext, useContext } from "react";

/**
 * - `legacy`: double-click to edit, each edit is saved on blur.
 * - `preview` / `edit`: Frames v2 authors. Edits are staged until Save and only accepted in `edit`.
 */
export type FrameEditMode = "legacy" | "preview" | "edit";

interface VizContextValue {
  isPdfMode: boolean;
  editText: EditTextFn | null;
  /** Origin-validated parent→viz listener from VisualizationWrapper. */
  addEventListener?: VisualizationUIAPI["addEventListener"];
  editMode?: FrameEditMode;
}

export const VizContext = createContext<VizContextValue>({
  isPdfMode: false,
  editText: null,
});

export function useVizContext(): VizContextValue {
  return useContext(VizContext);
}
