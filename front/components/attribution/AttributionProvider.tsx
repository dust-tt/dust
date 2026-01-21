"use client";

import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

import type { TrackingData } from "@app/lib/attribution";
import {
  getAttribution,
  setAttribution,
  syncAttributionToPostHog,
} from "@app/lib/attribution";
import { extractUTMParams } from "@app/lib/utils/utm";

interface AttributionProviderProps {
  children: React.ReactNode;
  hasConsent: boolean;
}

/**
 * Captures UTM parameters from URL and stores them with first-touch/last-touch attribution.
 * - First-touch is only set once (never overwritten)
 * - Last-touch is updated on each visit with new tracking params
 *
 * Must be rendered with hasConsent prop from hasCookiesAccepted().
 */
export function AttributionProvider({
  children,
  hasConsent,
}: AttributionProviderProps) {
  const router = useRouter();
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // Only process once per page load and only with consent
    if (hasProcessedRef.current || !hasConsent) {
      return;
    }

    // Extract UTM params from current URL
    const urlParams = new URLSearchParams(window.location.search);
    const utmParams = extractUTMParams(Object.fromEntries(urlParams));

    // Only store if we have tracking params
    if (Object.keys(utmParams).length === 0) {
      hasProcessedRef.current = true;
      return;
    }

    const trackingData: TrackingData = {
      ...utmParams,
      capturedAt: Date.now(),
      landingPage: window.location.pathname,
      referrer: document.referrer || undefined,
    };

    // Store attribution (handles first-touch vs last-touch internally)
    setAttribution(trackingData, hasConsent);

    // Sync to PostHog
    syncAttributionToPostHog(getAttribution());

    hasProcessedRef.current = true;
  }, [hasConsent, router.asPath]);

  return <>{children}</>;
}
