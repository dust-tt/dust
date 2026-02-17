import { useAppRouter } from "@app/lib/platform";
import {
  extractUTMParams,
  MARKETING_PARAMS,
  persistClickIdCookies,
} from "@app/lib/utils/utm";
import { useEffect } from "react";

/**
 * Captures UTM parameters from the URL, stores them in sessionStorage,
 * then strips them from the URL bar via a shallow router replace.
 */
export function useStripUtmParams() {
  const router = useAppRouter();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    try {
      const params = Object.fromEntries(
        new URLSearchParams(window.location.search)
      );
      const utmData = extractUTMParams(params);
      if (Object.keys(utmData).length > 0) {
        sessionStorage.setItem("utm_data", JSON.stringify(utmData));
        persistClickIdCookies(utmData);

        const url = new URL(window.location.href);
        let hasMarketingParam = false;
        for (const key of MARKETING_PARAMS) {
          if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            hasMarketingParam = true;
          }
        }
        if (hasMarketingParam) {
          window.history.replaceState(window.history.state, "", url.toString());
        }
      }
    } catch {
      // Ignore errors (e.g. sessionStorage unavailable).
    }
  }, [router.isReady]);
}
