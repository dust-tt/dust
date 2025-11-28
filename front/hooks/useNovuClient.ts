import { Novu } from "@novu/js";
import { useEffect, useState } from "react";

import { useUser } from "@app/lib/swr/user";

export const useNovuClient = () => {
  const { user } = useUser();
  const [novuClient, setNovuClient] = useState<Novu | null>(null);

  useEffect(() => {
    if (user?.subscriberHash && user?.sId) {
      if (!process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER) {
        throw new Error("NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER is not set");
      }
      if (!process.env.NEXT_PUBLIC_NOVU_API_URL) {
        throw new Error("NEXT_PUBLIC_NOVU_API_URL is not set");
      }
      if (!process.env.NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL) {
        throw new Error("NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL is not set");
      }

      const config = {
        applicationIdentifier:
          process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER,
        apiUrl: process.env.NEXT_PUBLIC_NOVU_API_URL,
        socketUrl: process.env.NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL,
        subscriber: user.sId,
        subscriberHash: user.subscriberHash,
      };

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNovuClient(new Novu(config));
    }
  }, [user?.subscriberHash, user?.sId]);

  return { novuClient };
};
