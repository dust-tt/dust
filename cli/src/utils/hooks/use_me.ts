import { useEffect, useState } from "react";
import { getDustClient } from "../dustClient.js";
import type { MeResponseType } from "@dust-tt/client";

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

      const dustClient = await getDustClient();
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        setIsLoading(false);
        return;
      }

      const meRes = await dustClient.me();

      if (meRes.isErr()) {
        setError(`Failed to get user information: ${meRes.error.message}`);
        setIsLoading(false);
        return;
      }

      setMe(meRes.value);
      setIsLoading(false);
    }

    fetchMe();
  }, [error, isLoading, me]);

  return { me, error, isLoading };
}
