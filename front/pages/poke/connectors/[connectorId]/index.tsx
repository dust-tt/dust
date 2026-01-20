import { Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useEffect } from "react";
import useSWR from "swr";

import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { fetcher } from "@app/lib/swr/swr";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function ConnectorRedirect() {
  const router = useRouter();
  const connectorId =
    typeof router.query.connectorId === "string"
      ? router.query.connectorId
      : null;

  const { data, error } = useSWR<{ redirectUrl: string }>(
    connectorId ? `/api/poke/connectors/${connectorId}/redirect` : null,
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

ConnectorRedirect.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Connector Redirect">{page}</PokeLayout>;
};
