"use client";

import {
  makeSendCrossDocumentMessage,
  VisualizationWrapperWithErrorBoundary,
} from "@viz/app/components/VisualizationWrapper";
import { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import type { VisualizationConfig } from "@viz/app/lib/visualization-api";
import { useMemo } from "react";

interface ClientVisualizationWrapperProps {
  allowedOrigins: string[];
  identifier: string;
  isEditable?: boolean;
  isFullHeight?: boolean;
}

/**
 * Client component for RPC-based visualization rendering
 * Uses cross-document messaging to fetch code and files from parent window.
 */
export function ClientVisualizationWrapper({
  allowedOrigins,
  identifier,
  isEditable = false,
  isFullHeight = false,
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
    isFullHeight,
    isPdfMode: false,
    dataAPI,
  };

  return <VisualizationWrapperWithErrorBoundary config={config} />;
}
