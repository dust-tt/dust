import { CONNECTOR_PROVIDERS, ConnectorProvider } from "@dust-tt/types";

export function isConnectorProvider(val: string): val is ConnectorProvider {
  return (CONNECTOR_PROVIDERS as unknown as string[]).includes(val);
}

export type ConnectorSyncStatus = "succeeded" | "failed";
export type ConnectorErrorType = "oauth_token_revoked";

export type ConnectorType = {
  id: number;
  type: ConnectorProvider;

  lastSyncStatus?: ConnectorSyncStatus;
  lastSyncStartTime?: number;
  lastSyncFinishTime?: number;
  lastSyncSuccessfulTime?: number;
  firstSuccessfulSyncTime?: number;
  firstSyncProgress?: string;
  errorType?: string;
  errorMessage?: string;
};
