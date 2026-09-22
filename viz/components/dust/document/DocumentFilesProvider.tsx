"use client";

import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

interface RegionState {
  src: string;
  pending: boolean;
  loading: boolean;
}

interface DocumentFilesContextValue {
  dataAPI: VisualizationDataAPI;
  readOnly: boolean;
  register: (id: string, src: string) => boolean;
  update: (id: string, state: Partial<RegionState> | null) => void;
}

interface DocumentFilesProviderProps {
  dataAPI: VisualizationDataAPI;
  readOnly?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  children: ReactNode;
}

const DocumentFilesContext = createContext<DocumentFilesContextValue | null>(
  null
);

/**
 * @cc [owner:flvndvd,label:concurrency] frame-document-regions
 * Pending changes and loading MUST aggregate across all mounted document regions.
 * A second region opening the same path MUST fail rather than mount a competing editor.
 */
export const DocumentFilesProvider = ({
  dataAPI,
  readOnly = false,
  onLoadingChange,
  children,
}: DocumentFilesProviderProps) => {
  const [bridgeError, setBridgeError] = useState(false);
  const regions = useRef(new Map<string, RegionState>());
  const previousPending = useRef(false);

  const report = useCallback(() => {
    let pending = false;
    let loading = false;
    for (const state of Array.from(regions.current.values())) {
      pending ||= state.pending;
      loading ||= state.loading;
    }
    onLoadingChange?.(loading);
    if (pending !== previousPending.current) {
      previousPending.current = pending;
      void dataAPI
        .setDocumentPendingChanges?.(pending)
        .catch(() => setBridgeError(true));
    }
  }, [dataAPI, onLoadingChange]);

  const register = useCallback(
    (id: string, src: string) => {
      for (const region of Array.from(regions.current.values())) {
        if (region.src === src) {
          return false;
        }
      }
      regions.current.set(id, { src, pending: false, loading: true });
      report();
      return true;
    },
    [report]
  );

  const update = useCallback(
    (id: string, state: Partial<RegionState> | null) => {
      const previous = regions.current.get(id);
      if (!previous) {
        return;
      }
      if (state === null) {
        regions.current.delete(id);
      } else {
        regions.current.set(id, { ...previous, ...state });
      }
      report();
    },
    [report]
  );

  const value = useMemo(
    () => ({ dataAPI, readOnly, register, update }),
    [dataAPI, readOnly, register, update]
  );

  return (
    <DocumentFilesContext.Provider value={value}>
      {bridgeError && (
        <p role="alert" className="p-4 text-sm">
          Dust could not track pending edits. Keep this Frame open until your
          changes are saved.
        </p>
      )}
      {children}
    </DocumentFilesContext.Provider>
  );
};

export const useDocumentFilesContext = () => useContext(DocumentFilesContext);
