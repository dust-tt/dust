import { appendUTMParams } from "@marketing/lib/utils/utm";
import { useEffect } from "react";

const DEFAULT_RETURN_TO = "/api/login";

export default function SignUpNextJS() {
  useEffect(() => {
    window.location.replace(
      appendUTMParams(
        `/api/workos/login?returnTo=${encodeURIComponent(DEFAULT_RETURN_TO)}&screenHint=sign-up`
      )
    );
  }, []);

  return null;
}
