import type { MeResponseType } from "@dust-tt/client";
import { useEffect, useState } from "react";

import { getDustClient } from "../dustClient.js";
import { getMe } from "../me.js";

export function useMe() {
  const [me, setMe] = useState<MeResponseType["user"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchMe() {
      if (isLoading || error || me) {
        return;
      }

      setIsLoading(true);
      setError(null);

      const dustClientRes = await getDustClient();
      if (dustClientRes.isErr()) {
        setError(dustClientRes.error.message);
        return;
      }

      const dustClient = dustClientRes.value;
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        setIsLoading(false);
        return;
      }

      // Resolves the user, handling API key auth (where .me() won't work).
      const meRes = await getMe(dustClient);

      if (meRes.isErr()) {
        setError(`Failed to get user information: ${meRes.error.message}`);
        setIsLoading(false);
        return;
      }

      setMe(meRes.value);
      setIsLoading(false);
    }

    void fetchMe();
  }, [error, isLoading, me]);

  return { me, error, isLoading };
}
