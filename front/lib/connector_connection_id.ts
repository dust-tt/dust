import { ConnectorProvider } from "@app/lib/connectors_api";
import { client_side_new_id } from "@app/lib/utils";

export function buildConnectionId(
  wId: string,
  provider: ConnectorProvider,
  suffix: string | null
): string {
  let connectionName = `${provider}-${wId}`;
  if (suffix) {
    connectionName += `-${suffix}`;
  }
  const uId = client_side_new_id();
  connectionName += `-${uId.slice(0, 10)}`;
  return connectionName;
}
