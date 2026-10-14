"use client";

import {
  makeSendCrossDocumentMessage,
  VisualizationWrapperWithErrorBoundary,
} from "@viz/app/components/VisualizationWrapper";
import { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import type { VizCatalog } from "@viz/app/lib/i18n/catalogs";
import { VizI18nProvider } from "@viz/app/lib/i18n/VizI18nProvider";
import type { VisualizationConfig } from "@viz/app/lib/visualization-api";
import { useMemo } from "react";

interface ClientVisualizationWrapperProps {
  allowedOrigins: string[];
  identifier: string;
  isEditable?: boolean;
  stagedEdits?: boolean;
  isFullHeight?: boolean;
  catalog: VizCatalog;
}

/**
 * Client component for RPC-based visualization rendering
 * Uses cross-document messaging to fetch code and files from parent window.
 */
export function ClientVisualizationWrapper({
  allowedOrigins,
  identifier,
  isEditable = false,
  stagedEdits = false,
  isFullHeight = false,
  catalog,
}: ClientVisualizationWrapperProps) {
  const sendCrossDocumentMessage = useMemo(
    () =>
      makeSendCrossDocumentMessage({
        allowedOrigins,
        identifier,
      }),
    [allowedOrigins, identifier]
  );

  const dataAPI = useMemo(
    () => new RPCDataAPI(sendCrossDocumentMessage),
    [sendCrossDocumentMessage]
  );

  const config: VisualizationConfig = {
    allowedOrigins,
    identifier,
    isEditable,
    stagedEdits,
    isFullHeight,
    isPdfMode: false,
    dataAPI,
  };

  return (
    <VizI18nProvider catalog={catalog}>
      <VisualizationWrapperWithErrorBoundary config={config} />
    </VizI18nProvider>
  );
}
