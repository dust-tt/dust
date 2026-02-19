import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { fetcher } from "@app/lib/swr/swr";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";
import useSWR from "swr";

export function ConnectorRedirectPage() {
  useSetPokePageTitle("Connector Redirect");

  const connectorId = useRequiredPathParam("connectorId");
  const router = useAppRouter();

  const { data, error } = useSWR<{ redirectUrl: string }>(
    `/api/poke/connectors/${connectorId}/redirect`,
    fetcher
  );

  useEffect(() => {
    if (data?.redirectUrl) {
      void router.replace(data.redirectUrl);
    }
  }, [data, router]);

  if (error) {
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
