import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  LightWorkspaceType,
} from "@dust-tt/types";
import type { UpdateConnectorRequestBody } from "@dust-tt/types";
import { CONNECTOR_TYPE_TO_MISMATCH_ERROR } from "@dust-tt/types";

import type { NotificationType } from "@app/components/sparkle/Notification";
import { setupConnection } from "@app/pages/w/[wId]/builder/data-sources/managed";

export async function handleUpdatePermissions(
  connector: ConnectorType,
  dataSource: DataSourceType,
  owner: LightWorkspaceType,
  dustClientFacingUrl: string,
  sendNotification: (notification: NotificationType) => void
) {
  const provider = connector.type;

  const connectionIdRes = await setupConnection({
    dustClientFacingUrl,
    owner,
    provider,
  });
  if (connectionIdRes.isErr()) {
    sendNotification({
      type: "error",
      title: "Failed to update the permissions of the Data Source",
      description: connectionIdRes.error.message,
    });
    return;
  }

  const updateRes = await updateConnectorConnectionId(
    connectionIdRes.value,
    provider,
    dataSource,
    owner
  );
  if (updateRes.error) {
    sendNotification({
      type: "error",
      title: "Failed to update the permissions of the Data Source",
      description: updateRes.error,
    });
    return;
  }
}

async function updateConnectorConnectionId(
  newConnectionId: string,
  provider: string,
  dataSource: DataSourceType,
  owner: LightWorkspaceType
) {
  const res = await fetch(
    `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionId: newConnectionId,
      } satisfies UpdateConnectorRequestBody),
    }
  );

  if (res.ok) {
    return { success: true, error: null };
  }

  const jsonErr = await res.json();
  const error = jsonErr.error;

  if (error.type === "connector_oauth_target_mismatch") {
    return {
      success: false,
      error: CONNECTOR_TYPE_TO_MISMATCH_ERROR[provider as ConnectorProvider],
    };
  }
  return {
    success: false,
    error: `Failed to update the permissions of the Data Source: (contact support@dust.tt for assistance)`,
  };
}
