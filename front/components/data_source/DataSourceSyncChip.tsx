import { Chip, Tooltip } from "@dust-tt/sparkle";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { DATASOURCE_QUOTA_PER_SEAT } from "@app/lib/plans/usage/types";
import { useConnector } from "@app/lib/swr/connectors";
import { timeAgoFrom } from "@app/lib/utils";
import type { ConnectorType, DataSourceType } from "@app/types";
import { assertNever, fileSizeToHumanReadable } from "@app/types";

export default function ConnectorSyncingChip({
  workspaceId,
  dataSource,
  initialState,
  activeSeats,
}: {
  workspaceId: string;
  dataSource: DataSourceType;
  initialState: ConnectorType;
  activeSeats: number;
}) {
  const {
    connector: refreshedConnector,
    isConnectorLoading,
    isConnectorError,
  } = useConnector({
    workspaceId,
    dataSource,
  });

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const connector = refreshedConnector || initialState;
  if (!connector) {
    if (isConnectorError) {
      return (
        <Chip color="warning">Error loading synchronization information</Chip>
      );
    } else if (isConnectorLoading) {
      return (
        <Chip color="info" isBusy>
          Loading
        </Chip>
      );
    } else {
      // This should never happen, but is a typescript possible case
      return <Chip color="warning">Connector not found</Chip>;
    }
  }

  if (connector.errorType) {
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
        return (
          <Tooltip
            label={
              "The synchronization failed because too many excessively large pages were found."
            }
            className="max-w-md"
            trigger={<Chip color="warning">Pages too large</Chip>}
          />
        );
      case "webcrawling_error_empty_content":
        return (
          <Tooltip
            label={"The synchronization failed to retrieve any content."}
            className="max-w-md"
            trigger={<Chip color="warning">Empty content</Chip>}
          />
        );
      case "webcrawling_error_blocked":
        return (
          <Tooltip
            label={
              "The synchronization failed because the websites blocks automated visits."
            }
            className="max-w-md"
            trigger={<Chip color="warning">Access blocked</Chip>}
          />
        );
      case "webcrawling_synchronization_limit_reached":
        return (
          <Tooltip
            label={
              "The website synchronization reached the maximum page limit."
            }
            className="max-w-md"
            trigger={<Chip color="info">Limit reached</Chip>}
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
      case "workspace_quota_exceeded":
        return (
          <Tooltip
            label={`You've exceeded the total storage quota of ${fileSizeToHumanReadable(activeSeats * DATASOURCE_QUOTA_PER_SEAT)} for your workspace. Contact support@dust.tt to upgrade your plan.`}
            trigger={<Chip color="warning">Quota exceeded</Chip>}
          />
        );
      default:
        assertNever(connector.errorType);
    }
  } else if (!connector.lastSyncSuccessfulTime) {
    return (
      <Chip color="info" isBusy>
        Synchronizing
        {connector.firstSyncProgress
          ? ` (${connector.firstSyncProgress})`
          : null}
      </Chip>
    );
  } else {
    return <Chip>{timeAgoFrom(connector.lastSyncSuccessfulTime)} ago</Chip>;
  }
}
