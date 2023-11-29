import { ConnectorProvider } from "@dust-tt/types";

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
