"use client";

import {
  VisualizationWrapperWithErrorBoundary,
  makeSendCrossDocumentMessage,
} from "@viz/app/components/VisualizationWrapper";
import { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import { VisualizationConfig } from "@viz/app/lib/visualization-api";
import { useMemo } from "react";

interface ClientVisualizationWrapperProps {
  allowedOrigins: string[];
  identifier: string;
  isFullHeight?: boolean;
}

/**
 * Client component for RPC-based visualization rendering
 * Uses cross-document messaging to fetch code and files from parent window.
 */
export function ClientVisualizationWrapper({
  allowedOrigins,
  identifier,
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

  // Create RPC data API for dynamic fetching.
  console.log(
    ">> Creating RPCDataAPI with sendCrossDocumentMessage:",
    sendCrossDocumentMessage
  );

  const dataAPI = useMemo(
    () => new RPCDataAPI(sendCrossDocumentMessage),
    [sendCrossDocumentMessage]
  );

  const config: VisualizationConfig = {
    allowedOrigins,
    identifier,
    isFullHeight,
    dataAPI,
  };

  return <VisualizationWrapperWithErrorBoundary config={config} />;
}
