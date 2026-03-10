import { useRegionContext } from "@app/lib/auth/RegionContext";
import { useUser } from "@app/lib/swr/user";
import { Novu } from "@novu/js";
import { useEffect, useMemo, useState } from "react";

const getNovuEnvForRegion = ({
  isEuRegion,
}: {
  isEuRegion: boolean;
}): {
  applicationIdentifier: string | undefined;
  apiUrl: string | undefined;
  socketUrl: string | undefined;
} => {
  if (isEuRegion) {
    return {
      applicationIdentifier:
        process.env.NOVU_APPLICATION_IDENTIFIER_EU ??
        process.env.NOVU_APPLICATION_IDENTIFIER,
      apiUrl: process.env.NOVU_API_URL_EU ?? process.env.NOVU_API_URL,
      socketUrl:
        process.env.NOVU_WEBSOCKET_API_URL_EU ??
        process.env.NOVU_WEBSOCKET_API_URL,
    };
  }

  return {
    applicationIdentifier:
      process.env.NOVU_APPLICATION_IDENTIFIER_US ??
      process.env.NOVU_APPLICATION_IDENTIFIER,
    apiUrl: process.env.NOVU_API_URL_US ?? process.env.NOVU_API_URL,
    socketUrl:
      process.env.NOVU_WEBSOCKET_API_URL_US ??
      process.env.NOVU_WEBSOCKET_API_URL,
  };
};

export const useNovuClient = () => {
  const { user } = useUser();
  const regionContext = useRegionContext();
  const [novuClient, setNovuClient] = useState<Novu | null>(null);

  const novuConfig = useMemo(() => {
    const regionName = regionContext?.regionInfo.name;
    const regionUrl = regionContext?.regionInfo.url;

    const isEuRegion =
      regionName?.startsWith("europe-") ||
      (regionUrl ? regionUrl.includes("://eu.") : false);

    return getNovuEnvForRegion({ isEuRegion: Boolean(isEuRegion) });
  }, [regionContext?.regionInfo.name, regionContext?.regionInfo.url]);

  useEffect(() => {
    if (user?.subscriberHash && user?.sId) {
      if (!novuConfig.applicationIdentifier) {
        throw new Error("NOVU_APPLICATION_IDENTIFIER is not set");
      }
      if (!novuConfig.apiUrl) {
        throw new Error("NOVU_API_URL is not set");
      }
      if (!novuConfig.socketUrl) {
        throw new Error("NOVU_WEBSOCKET_API_URL is not set");
      }

      const config = {
        applicationIdentifier: novuConfig.applicationIdentifier,
        apiUrl: novuConfig.apiUrl,
        socketUrl: novuConfig.socketUrl,
        subscriber: user.sId,
        subscriberHash: user.subscriberHash,
      };

      setNovuClient(new Novu(config));
    }
  }, [
    novuConfig.apiUrl,
    novuConfig.applicationIdentifier,
    novuConfig.socketUrl,
    user?.subscriberHash,
    user?.sId,
  ]);

  return { novuClient };
};
