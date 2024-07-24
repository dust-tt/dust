import type { ConnectorProvider, LabsConnectorProvider } from "@dust-tt/types";

import { client_side_new_id } from "@app/lib/utils";

export function buildConnectionId(
  wId: string,
  provider: ConnectorProvider
): string {
  let connectionName = `${provider}-${wId}`;
  const uId = client_side_new_id();
  connectionName += `-${uId.slice(0, 10)}`;
  return connectionName;
}

// Labs adds connections that are not necessarily made available to the rest of the product.
export function buildLabsConnectionId(
  wId: string,
  provider: LabsConnectorProvider
): string {
  let connectionName = `${provider}-${wId}`;
  const uId = client_side_new_id();
  connectionName += `-${uId.slice(0, 10)}`;
  return connectionName;
}
