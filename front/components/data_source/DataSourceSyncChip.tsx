import { Chip } from "@dust-tt/sparkle";
import type { ConnectorType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useConnector } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";

export default function ConnectorSyncingChip({
  workspaceId,
  dataSourceName,
  initialState,
}: {
  workspaceId: string;
  dataSourceName: string;
  initialState: ConnectorType;
}) {
  const {
    connector: refreshedConnector,
    isConnectorLoading,
    isConnectorError,
  } = useConnector({
    workspaceId: workspaceId,
    dataSourceName: dataSourceName,
  });

  const connector = refreshedConnector || initialState;
  if (!connector) {
    if (isConnectorError) {
      return (
        <Chip color="warning">Error loading synchronization information</Chip>
      );
    } else if (isConnectorLoading) {
      return (
        <Chip color="amber" isBusy>
          Loading
        </Chip>
      );
    } else {
      // This should never happen, but is a typescript possible case
      return <Chip color="warning">Connector not found</Chip>;
    }
  }

  if (connector.errorType) {
    return (
      <Chip color="warning">
        {(() => {
          switch (connector.errorType) {
            case "oauth_token_revoked":
              return (
                <>
                  Our access to your account has been revoked. Re-authorize to
                  keep the connection up-to-date.
                </>
              );
            case "third_party_internal_error":
              return (
                <>
                  We have encountered an error with{" "}
                  {CONNECTOR_CONFIGURATIONS[connector.type].name}. We sent you
                  an email to resolve the issue.
                </>
              );
            case "webcrawling_error":
              return <>Synchronization failed</>;
            default:
              assertNever(connector.errorType);
          }
        })()}
      </Chip>
    );
  } else if (!connector.lastSyncSuccessfulTime) {
    return (
      <Chip color="amber" isBusy>
        Synchronizing
        {connector.firstSyncProgress
          ? ` (${connector.firstSyncProgress})`
          : null}
      </Chip>
    );
  } else {
    return (
      <Chip color="slate">
        Last Sync ~ {timeAgoFrom(connector.lastSyncSuccessfulTime)} ago
      </Chip>
    );
  }
}
