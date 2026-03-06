import { useAppRouter } from "@app/lib/platform";
import { DUST_ANONYMOUS_ID_COOKIE } from "@app/lib/utils/anonymous_id";
import { useEffect, useRef } from "react";

/**
 * Sends a server-side page view event to `/api/t/pv` on each route change.
 * Uses `navigator.sendBeacon` for non-blocking sends with a `fetch` fallback.
 * Debounced so rapid route changes don't fire duplicate events.
 */
export function useServerPageView() {
  const router = useAppRouter();
  const lastSentUrl = useRef<string | null>(null);

  useEffect(() => {
    function sendPageView() {
      const pageUrl = window.location.href;

      // Avoid duplicate sends for the same URL.
      if (pageUrl === lastSentUrl.current) {
        return;
      }
      lastSentUrl.current = pageUrl;

      const aidCookie = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${DUST_ANONYMOUS_ID_COOKIE}=`));
      const anonymousId = aidCookie ? aidCookie.split("=")[1] : undefined;

      const body = JSON.stringify({
        page_url: pageUrl,
        referrer: document.referrer || undefined,
        anonymous_id: anonymousId,
      });

      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(
          "/api/t/pv",
          new Blob([body], { type: "application/json" })
        );
      } else {
        // eslint-disable-next-line no-restricted-globals
        void fetch("/api/t/pv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    }

    // Fire on initial load.
    sendPageView();

    // Fire on client-side route changes.
    router.events.on("routeChangeComplete", sendPageView);
    return () => {
      router.events.off("routeChangeComplete", sendPageView);
    };
  }, [router.events]);
}
