"use client";

import { NavigationProvider } from "@viz/app/components/NavigationProvider";
import {
  makeSendCrossDocumentMessage,
  VisualizationWrapperWithErrorBoundary,
} from "@viz/app/components/VisualizationWrapper";
import {
  CacheDataAPI,
  type PreFetchedFile,
} from "@viz/app/lib/data-apis/cache-data-api";
import { HybridDataAPI } from "@viz/app/lib/data-apis/hybrid-data-api";
import { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import type { VisualizationConfig } from "@viz/app/lib/visualization-api";
import { useMemo } from "react";

// Domains that are trusted and don't require user confirmation before navigation.
// These are Dust platform domains that are considered safe for automatic navigation.
const TRUSTED_NAVIGATION_DOMAINS = ["dust.tt", "eu.dust.tt"];

interface ServerVisualizationWrapperClientProps {
  allowedOrigins: string[];
  identifier: string;
  isAuthenticatedMember?: boolean;
  isFullHeight?: boolean;
  isPdfMode?: boolean;
  prefetchedCode?: string;
  prefetchedFiles?: PreFetchedFile[];
}

/**
 * Client-side visualization wrapper for server-side rendered visualizations.
 *
 * This component runs on the client and:
 * 1. Receives plain pre-fetched data from the server component (avoids serialization issues)
 * 2. Creates a CacheDataAPI instance using the pre-fetched code and files
 * 3. Uses authenticated RPC for member file access, retaining cached files for other viewers
 *
 * This is the client counterpart to ServerSideVisualizationWrapper and handles
 * the React Server Component serialization boundary by accepting plain objects
 * instead of class instances.
 */
/**
 * @cc [owner:flvndvd,label:security] shared-frame-data-api-selection
 * Only server-confirmed workspace members MAY use the authenticated RPC bridge.
 * Anonymous views and PDF exports MUST use the read-only cache without RPC access.
 */
export function ServerVisualizationWrapperClient({
  identifier,
  allowedOrigins,
  isAuthenticatedMember = false,
  isFullHeight = false,
  isPdfMode = false,
  prefetchedCode,
  prefetchedFiles = [],
}: ServerVisualizationWrapperClientProps) {
  const dataAPI = useMemo(() => {
    const cache = new CacheDataAPI(prefetchedFiles, prefetchedCode);
    if (!isAuthenticatedMember || isPdfMode) {
      return cache;
    }

    // Members use live file permissions while the published code stays cached.
    const sendMessage = makeSendCrossDocumentMessage({
      allowedOrigins,
      identifier,
    });
    return new HybridDataAPI(cache, new RPCDataAPI(sendMessage));
  }, [
    prefetchedCode,
    prefetchedFiles,
    isAuthenticatedMember,
    isPdfMode,
    allowedOrigins,
    identifier,
  ]);

  const config: VisualizationConfig = {
    allowedOrigins,
    dataAPI,
    identifier,
    isFullHeight,
    isPdfMode,
  };

  return (
    <NavigationProvider trustedDomains={TRUSTED_NAVIGATION_DOMAINS}>
      <VisualizationWrapperWithErrorBoundary config={config} />
    </NavigationProvider>
  );
}
