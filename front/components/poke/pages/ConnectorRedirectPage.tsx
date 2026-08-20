import { useRegionContext } from "@app/lib/auth/RegionContext";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { usePokeRegion } from "@app/lib/swr/poke";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokeConnectorRedirectAllRegions } from "@app/poke/swr/search";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

export function ConnectorRedirectPage() {
  usePokePageMetadata({ name: "Connector Redirect" });

  const connectorId = useRequiredPathParam("connectorId");
  const router = useAppRouter();
  const { regionInfo, setRegionInfo } = useRegionContext();
  const { regionData } = usePokeRegion();
  const regionUrls = regionData?.regionUrls ?? null;

  const { redirect, isError } = usePokeConnectorRedirectAllRegions({
    connectorId,
    regionUrls,
  });

  useEffect(() => {
    if (!redirect) {
      return;
    }

    // Switch region if the connector lives in a different region before
    // navigating, so the destination page fetches from the correct region.
    if (redirect.region !== regionInfo.name && regionUrls) {
      setRegionInfo({
        name: redirect.region,
        url: regionUrls[redirect.region],
      });
    }

    void router.replace(redirect.redirectUrl);
  }, [redirect, regionInfo.name, regionUrls, setRegionInfo, router]);

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Connector not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  );
}
