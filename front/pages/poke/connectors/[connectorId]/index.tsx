import type { ConnectorType } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { GetServerSideProps } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import logger from "@app/logger/logger";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    logger.error("poke: not superUser");
    return {
      notFound: true,
    };
  }

  const connectorId = context.params?.connectorId;

  if (!connectorId || typeof connectorId !== "string") {
    logger.error({ connectorId }, "poke: connectorId is not a string");
    return {
      notFound: true,
    };
  }

  const connectorsAPI = new ConnectorsAPI(logger);
  const cRes = await connectorsAPI.getConnector(connectorId);
  if (cRes.isErr()) {
    logger.error(
      { connectorId, error: cRes.error },
      "poke: error fetching connector"
    );
    return {
      notFound: true,
    };
  }

  const connector: ConnectorType = cRes.value;

  return {
    redirect: {
      destination: `/poke/${connector.workspaceId}/data_sources/${connector.dataSourceName}`,
      permanent: false,
    },
  };
};

export default function Redirect() {
  return <></>;
}
