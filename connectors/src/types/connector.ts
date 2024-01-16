import type { ConnectorProvider } from "@dust-tt/types";

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
