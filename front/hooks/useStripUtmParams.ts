import { hasCookiesAccepted } from "@app/lib/cookies";
import { useAppRouter } from "@app/lib/platform";
import { getOrCreateAnonymousId } from "@app/lib/utils/anonymous_id";
import {
  extractUTMParams,
  MARKETING_PARAMS,
  persistClickIdCookies,
  persistDustAidFromURL,
  persistLandingContext,
  persistUTMCookies,
} from "@app/lib/utils/utm";
import { useEffect } from "react";
import { useCookies } from "react-cookie";

const DUST_COOKIES_ACCEPTED_NAME = "dust-cookies-accepted";

/**
 * Post-consent only: captures UTM params, click IDs, landing context, and
 * the `dust_aid` URL param into first-party cookies/sessionStorage, then
 * strips tracking params from the URL. Also ensures the `_dust_aid` cookie
 * exists. Pre-consent, nothing is written and the URL is left untouched so
 * UTMs can still be captured if consent arrives later in the same page.
 */
export function useStripUtmParams() {
  const router = useAppRouter();
  const [cookies] = useCookies([DUST_COOKIES_ACCEPTED_NAME]);
  const cookiesAccepted = hasCookiesAccepted(
    cookies[DUST_COOKIES_ACCEPTED_NAME]
  );

  useEffect(() => {
    if (!router.isReady || !cookiesAccepted) {
      return;
    }

    try {
      persistDustAidFromURL();
      persistLandingContext();

      const params = Object.fromEntries(
        new URLSearchParams(window.location.search)
      );
      const utmData = extractUTMParams(params);
      if (Object.keys(utmData).length > 0) {
        sessionStorage.setItem("utm_data", JSON.stringify(utmData));
        persistClickIdCookies(utmData);
        persistUTMCookies(utmData);
      }

      const url = new URL(window.location.href);
      let hasTrackingParam = false;
      for (const key of MARKETING_PARAMS) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          hasTrackingParam = true;
        }
      }
      if (url.searchParams.has("dust_aid")) {
        url.searchParams.delete("dust_aid");
        hasTrackingParam = true;
      }
      if (hasTrackingParam) {
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch {
      // Ignore errors (e.g. sessionStorage unavailable).
    }
  }, [router.isReady, cookiesAccepted]);

  useEffect(() => {
    if (cookiesAccepted) {
      getOrCreateAnonymousId();
    }
  }, [cookiesAccepted]);
}
