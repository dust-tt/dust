import { appendUTMParams, extractUTMParams } from "@app/lib/utils/utm";
import { useEffect } from "react";

const DEFAULT_RETURN_TO = "/api/login";

export default function SignUpNextJS() {
  useEffect(() => {
    // Extract UTM params directly from the current URL so that params like
    // `seatbased` and `partner` are forwarded even before sessionStorage is populated.
    const urlParams = Object.fromEntries(
      new URLSearchParams(window.location.search)
    );
    const freshUtmParams = extractUTMParams(urlParams);

    window.location.href = appendUTMParams(
      `/api/workos/login?returnTo=${encodeURIComponent(DEFAULT_RETURN_TO)}&screenHint=sign-up`,
      freshUtmParams
    );
  }, []);

  return null;
}
