import { Chip, Tooltip } from "@dust-tt/sparkle";
import type { ConnectorType, DataSourceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useConnector } from "@app/lib/swr/connectors";
import { timeAgoFrom } from "@app/lib/utils";

export default function ConnectorSyncingChip({
  workspaceId,
  dataSource,
  initialState,
}: {
  workspaceId: string;
  dataSource: DataSourceType;
  initialState: ConnectorType;
}) {
  const {
    connector: refreshedConnector,
    isConnectorLoading,
    isConnectorError,
  } = useConnector({
    workspaceId,
    dataSource,
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
    let label = "";
    switch (connector.errorType) {
      case "oauth_token_revoked":
        return (
          <Tooltip
            label={
              "Our access to your account has been revoked. Re-authorize to keep the connection up-to-date."
            }
            trigger={<Chip color="warning">Re-authorization required</Chip>}
          />
        );
      case "third_party_internal_error":
        return (
          <Tooltip
            label={
              `We have encountered an error with ${CONNECTOR_CONFIGURATIONS[connector.type].name}. ` +
              "We sent you an email to resolve the issue."
            }
            trigger={<Chip color="warning">Synchronization failed</Chip>}
          />
        );
      case "webcrawling_error_content_too_large":
        label = "Page too large: this page contains too much data.";
        return (
          <Tooltip
            label={label}
            className="max-w-md"
            trigger={
              <Chip className="w-36" color="warning">
                <div className="w-full truncate">{label}</div>
              </Chip>
            }
          />
        );
      case "webcrawling_error_empty_content":
        label =
          "Unable to read: this site's content loads in a way we can't read.";
        return (
          <Tooltip
            label={label}
            className="max-w-md"
            trigger={
              <Chip className="w-36" color="warning">
                <div className="w-full truncate">{label}</div>
              </Chip>
            }
          />
        );
      case "webcrawling_error_blocked":
        label = "Access denied: the site blocks automated visits.";
        return (
          <Tooltip
            label={label}
            className="max-w-md"
            trigger={
              <Chip className="w-36" color="warning">
                <div className="w-full truncate">{label}</div>
              </Chip>
            }
          />
        );
      case "webcrawling_error":
        return <Chip color="warning">Synchronization failed</Chip>;
      case "remote_database_connection_not_readonly":
        return (
          <Tooltip
            label={
              "We need read-only access to your database to synchronize data." +
              " Please update the permissions and try again."
            }
            trigger={<Chip color="warning">Synchronization failed</Chip>}
          />
        );
      case "remote_database_network_error":
        return (
          <Tooltip
            label={
              "We encountered a network error while trying to connect to your database." +
              "Please check your network connection and try again."
            }
            trigger={<Chip color="warning">Synchronization failed</Chip>}
          />
        );
      default:
        assertNever(connector.errorType);
    }
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
