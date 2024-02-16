import { Chip } from "@dust-tt/sparkle";
import { assertNever } from "@dust-tt/types";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useConnector } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";

export default function ConnectorSyncingChip({
  workspaceId,
  dataSourceName,
}: {
  workspaceId: string;
  dataSourceName: string;
}) {
  const { connector, isConnectorLoading, isConnectorError } = useConnector({
    workspaceId: workspaceId,
    dataSourceName: dataSourceName,
  });

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
                  Oops! It seems that our access to your account has been
                  revoked. Please re-authorize this Data Source to keep your
                  data up to date on Dust.
                </>
              );
            case "third_party_internal_error":
              return (
                <>
                  We have encountered an error talking to{" "}
                  {CONNECTOR_CONFIGURATIONS[connector.type].name}. We sent you
                  an email with more details to resolve the issue.
                </>
              );
            default:
              assertNever(connector.errorType);
          }
          return <></>;
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
