import config from "@app/lib/api/config";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import logger from "@app/logger/logger";
import type { ConnectorType } from "@app/types";
import { ConnectorsAPI } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async (context) => {
    const connectorId = context.params?.connectorId;

    if (!connectorId || typeof connectorId !== "string") {
      return {
        notFound: true,
      };
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const cRes = await connectorsAPI.getConnector(connectorId);
    if (cRes.isErr()) {
      return {
        notFound: true,
      };
    }

    const connector: ConnectorType = {
      ...cRes.value,
      connectionId: null,
    };

    return {
      redirect: {
        destination: `/poke/${connector.workspaceId}/data_sources/${connector.dataSourceId}`,
        permanent: false,
      },
    };
  }
);

export default function Redirect() {
  return <></>;
}
