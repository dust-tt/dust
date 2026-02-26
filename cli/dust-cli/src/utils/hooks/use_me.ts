import type { MeResponseType } from "@dust-tt/client";
import { useEffect, useState } from "react";

import { getDustClient } from "../dustClient.js";

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

      // Check if using API key authentication
      const apiKey = await dustClient.getApiKey();
      if (apiKey?.startsWith("sk-")) {
        // For API key auth, create a mock user object since .me() won't work
        // API keys don't have access to user information, so we create a placeholder
        setMe({
          sId: "api-user",
          id: 0, // ModelId type, using 0 as placeholder
          createdAt: Date.now(),
          provider: "google", // Default provider
          username: "api-user",
          email: "api-user@workspace",
          firstName: "API",
          lastName: "User",
          fullName: "API User",
          image: null,
          workspaces: [], // Will be empty for API keys
        });
        setIsLoading(false);
        return;
      }

      // For OAuth tokens, use existing .me() call
      const meRes = await dustClient.me();

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
