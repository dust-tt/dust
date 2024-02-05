import { Chip } from "@dust-tt/sparkle";
import type { ConnectorType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { useEffect, useState } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
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
                  We have ecountered an error talking to{" "}
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
        {connector?.firstSyncProgress
          ? ` (${connector?.firstSyncProgress})`
          : null}
      </Chip>
    );
  } else {
    return <Chip color="slate">Last Sync ~ {computedTimeAgo} ago</Chip>;
  }
}
