import type { ConnectorType } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";

import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import logger from "@app/logger/logger";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async (context, auth) => {
    if (!auth.isDustSuperUser()) {
      return {
        notFound: true,
      };
    }

    const connectorId = context.params?.connectorId;

    if (!connectorId || typeof connectorId !== "string") {
      return {
        notFound: true,
      };
    }

    const connectorsAPI = new ConnectorsAPI(logger);
    const cRes = await connectorsAPI.getConnector(connectorId);
    if (cRes.isErr()) {
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
  }
);

export default function Redirect() {
  return <></>;
}
