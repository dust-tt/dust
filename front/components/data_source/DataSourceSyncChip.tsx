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
    switch (connector.errorType) {
      case "oauth_token_revoked":
        return (
          <Chip color="warning">
            Our access to your account has been revoked. Re-authorize to keep
            the connection up-to-date.
          </Chip>
        );
      case "third_party_internal_error":
        return (
          <Chip color="warning">
            We have encountered an error with{" "}
            {CONNECTOR_CONFIGURATIONS[connector.type].name}. We sent you an
            email to resolve the issue.
          </Chip>
        );
      case "webcrawling_error":
        return (
          <>
            <Chip color="warning">Synchronization failed.</Chip>
            <div className="text-sm">
              The webcrawler was unable to parse any pages. This may be because
              the site is built with JavaScript, which our current crawler
              cannot interpret.
            </div>
          </>
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
