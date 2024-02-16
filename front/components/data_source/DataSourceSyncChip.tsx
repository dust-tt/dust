import { Chip } from "@dust-tt/sparkle";
import type { ConnectorType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { useEffect, useState } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useConnector } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";

export default function ConnectorSyncingChip({
  connector,
}: {
  connector: ConnectorType;
}) {
  const [computedTimeAgo, setComputedTimeAgo] = useState<string | null>(null);
  const refreshedConnector = useConnector({
    workspaceId: connector.workspaceId,
    dataSourceName: connector.dataSourceName,
    refreshInterval: 3000,
  });

  useEffect(() => {
    if (refreshedConnector.connector?.lastSyncSuccessfulTime) {
      setComputedTimeAgo(
        timeAgoFrom(refreshedConnector.connector.lastSyncSuccessfulTime)
      );
    }
  }, [refreshedConnector.connector?.lastSyncSuccessfulTime]);

  if (refreshedConnector.connector?.errorType) {
    return (
      <Chip color="warning">
        {(() => {
          switch (refreshedConnector.connector?.errorType) {
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
                  We have ecountered an error talking to{" "}
                  {
                    CONNECTOR_CONFIGURATIONS[refreshedConnector.connector.type]
                      .name
                  }
                  . We sent you an email with more details to resolve the issue.
                </>
              );
            default:
              assertNever(refreshedConnector.connector?.errorType);
          }
          return <></>;
        })()}
      </Chip>
    );
  } else if (!refreshedConnector.connector?.lastSyncSuccessfulTime) {
    return (
      <Chip color="amber" isBusy>
        Synchronizing
        {refreshedConnector.connector?.firstSyncProgress
          ? ` (${refreshedConnector.connector.firstSyncProgress})`
          : null}
      </Chip>
    );
  } else {
    return <Chip color="slate">Last Sync ~ {computedTimeAgo} ago</Chip>;
  }
}
