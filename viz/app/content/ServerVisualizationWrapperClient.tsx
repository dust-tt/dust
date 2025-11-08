"use client";

import { VisualizationWrapperWithErrorBoundary } from "@viz/app/components/VisualizationWrapper";
import {
  CacheDataAPI,
  PreFetchedFile,
} from "@viz/app/lib/data-apis/cache-data-api";
import type { VisualizationConfig } from "@viz/app/lib/visualization-api";
import { useMemo } from "react";

interface ServerVisualizationWrapperClientProps {
  allowedOrigins: string[];
  identifier: string;
  isFullHeight?: boolean;
  prefetchedCode?: string;
  prefetchedFiles?: PreFetchedFile[];
}

/**
 * Client-side visualization wrapper for server-side rendered visualizations.
 *
 * This component runs on the client and:
 * 1. Receives plain pre-fetched data from the server component (avoids serialization issues)
 * 2. Creates a CacheDataAPI instance using the pre-fetched code and files
 * 3. Renders the visualization using the cached data (no network requests needed)
 *
 * This is the client counterpart to ServerSideVisualizationWrapper and handles
 * the React Server Component serialization boundary by accepting plain objects
 * instead of class instances.
 */
export function ServerVisualizationWrapperClient({
  identifier,
  allowedOrigins,
  isFullHeight = false,
  prefetchedCode,
  prefetchedFiles = [],
}: ServerVisualizationWrapperClientProps) {
  const dataAPI = useMemo(() => {
    // Create cache-based API with pre-fetched data.
    return new CacheDataAPI(prefetchedFiles, prefetchedCode);
  }, [prefetchedCode, prefetchedFiles]);

  const config: VisualizationConfig = {
    allowedOrigins,
    dataAPI,
    identifier,
    isFullHeight,
  };

  return <VisualizationWrapperWithErrorBoundary config={config} />;
}
