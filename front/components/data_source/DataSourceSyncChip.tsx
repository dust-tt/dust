import { Chip } from "@dust-tt/sparkle";
import type { ConnectorType } from "@dust-tt/types";
import { useEffect, useState } from "react";

import { timeAgoFrom } from "@app/lib/utils";

export default function ConnectorSyncingChip({
  connector,
}: {
  connector: ConnectorType;
}) {
  const [computedTimeAgo, setComputedTimeAgo] = useState<string | null>(null);

  useEffect(() => {
    if (connector.lastSyncSuccessfulTime) {
      setComputedTimeAgo(timeAgoFrom(connector.lastSyncSuccessfulTime));
    }
  }, [connector.lastSyncSuccessfulTime]);
  if (connector.errorType) {
    return (
      <Chip color="warning">
        Oops! It seems that our access to your account has been revoked. Please
        re-authorize this Data Source to keep your data up to date on Dust.
      </Chip>
    );
  } else if (!connector.lastSyncSuccessfulTime) {
    return (
      <Chip color="amber" isBusy>
        Synchronizing
        {connector?.firstSyncProgress
          ? ` (${connector?.firstSyncProgress})`
          : null}
      </Chip>
    );
  } else {
    return <Chip color="slate">Last Sync ~ {computedTimeAgo} ago</Chip>;
  }
}
