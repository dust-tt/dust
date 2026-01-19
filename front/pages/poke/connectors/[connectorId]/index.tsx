import { Spinner } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useEffect } from "react";
import useSWR from "swr";

import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { fetcher } from "@app/lib/swr/swr";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  connectorId: string;
}>(async (context) => {
  const { connectorId } = context.params ?? {};
  if (!isString(connectorId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      connectorId,
    },
  };
});

export default function ConnectorRedirectWrapper({
  connectorId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

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

ConnectorRedirectWrapper.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Connector Redirect">{page}</PokeLayout>;
};
