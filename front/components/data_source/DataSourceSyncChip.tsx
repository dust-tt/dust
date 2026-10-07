import { timeAgoFrom } from "@app/lib/client/relative_time";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { formatFileSize } from "@app/lib/i18n/format";
import { DATASOURCE_QUOTA_PER_SEAT } from "@app/lib/plans/usage/types";
import type { ConnectorType } from "@app/types/data_source";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Chip, Tooltip } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface ConnectorSyncingChipProps {
  activeSeats: number;
  connector: ConnectorType;
  connectorError: string | null;
}

export default function ConnectorSyncingChip({
  activeSeats,
  connector,
  connectorError,
}: ConnectorSyncingChipProps) {
  const { t } = useLingui();
  const providerName = CONNECTOR_CONFIGURATIONS[connector.type].name;

  if (connectorError) {
    return (
      <Chip color="warning">
        <Trans>Error loading synchronization information</Trans>
      </Chip>
    );
  }

  if (connector.errorType) {
    switch (connector.errorType) {
      case "oauth_token_revoked":
        return (
          <Tooltip
            label={t`Our access to your account has been revoked. Re-authorize to keep the connection up-to-date.`}
            trigger={
              <Chip color="warning">
                <Trans>Re-authorization required</Trans>
              </Chip>
            }
          />
        );
      case "third_party_internal_error":
        return (
          <Tooltip
            label={t`We have encountered an error with ${providerName}. We sent you an email to resolve the issue.`}
            trigger={
              <Chip color="warning">
                <Trans>Synchronization failed</Trans>
              </Chip>
            }
          />
        );
      case "transient_upstream_error":
        return (
          <Tooltip
            label={t`We are having trouble retrieving your data from ${providerName}. Synchronization will resume automatically once the issue is resolved.`}
            className="max-w-md"
            trigger={
              <Chip color="warning">
                <Trans>Synchronization delayed</Trans>
              </Chip>
            }
          />
        );
      case "webcrawling_error_content_too_large":
        return (
          <Tooltip
            label={t`The synchronization failed because too many excessively large pages were found.`}
            className="max-w-md"
            trigger={
              <Chip color="warning">
                <Trans>Pages too large</Trans>
              </Chip>
            }
          />
        );
      case "webcrawling_error_empty_content":
        return (
          <Tooltip
            label={t`The synchronization failed to retrieve any content.`}
            className="max-w-md"
            trigger={
              <Chip color="warning">
                <Trans>Empty content</Trans>
              </Chip>
            }
          />
        );
      case "webcrawling_error_blocked":
        return (
          <Tooltip
            label={t`The synchronization failed because the website blocks automated visits.`}
            className="max-w-md"
            trigger={
              <Chip color="warning">
                <Trans>Access blocked</Trans>
              </Chip>
            }
          />
        );
      case "webcrawling_synchronization_limit_reached":
        return (
          <Tooltip
            label={t`The website synchronization reached the maximum page limit.`}
            className="max-w-md"
            trigger={
              <Chip color="info">
                <Trans>Limit reached</Trans>
              </Chip>
            }
          />
        );
      case "webcrawling_error":
        return (
          <Chip color="warning">
            <Trans>Synchronization failed</Trans>
          </Chip>
        );
      case "remote_database_connection_not_readonly":
        return (
          <Tooltip
            label={t`We need read-only access to your database to synchronize data. Please update the permissions and try again.`}
            trigger={
              <Chip color="warning">
                <Trans>Synchronization failed</Trans>
              </Chip>
            }
          />
        );
      case "remote_database_network_error":
        return (
          <Tooltip
            label={t`We encountered a network error while trying to connect to your database. Please check your network connection and try again.`}
            trigger={
              <Chip color="warning">
                <Trans>Synchronization failed</Trans>
              </Chip>
            }
          />
        );
      case "workspace_quota_exceeded": {
        const quota = formatFileSize(activeSeats * DATASOURCE_QUOTA_PER_SEAT, {
          decimals: 0,
        });
        return (
          <Tooltip
            label={t`You've exceeded the total storage quota of ${quota} for your workspace. Contact support@dust.tt to upgrade your plan.`}
            trigger={
              <Chip color="warning">
                <Trans>Quota exceeded</Trans>
              </Chip>
            }
          />
        );
      }
      case "workspace_plan_no_api_access":
        return (
          <Tooltip
            label={t`Your current plan does not allow API access, which is required to synchronize data. Contact support@dust.tt to upgrade your plan.`}
            trigger={
              <Chip color="warning">
                <Trans>Synchronization failed</Trans>
              </Chip>
            }
          />
        );
      case "workspace_relocated":
        return (
          <Tooltip
            label={t`This workspace has been moved to another region. Contact support@dust.tt if you still see this connection.`}
            trigger={
              <Chip color="warning">
                <Trans>Synchronization failed</Trans>
              </Chip>
            }
          />
        );
      default:
        assertNeverAndIgnore(connector.errorType);
    }
  } else if (connector.pausedAt) {
    return (
      <Tooltip
        label={t`Synchronization is paused. New content won't be synced until resumed.`}
        trigger={
          <Chip>
            <Trans>Paused</Trans>
          </Chip>
        }
      />
    );
  } else {
    // Check if a sync is currently in progress
    const isSyncInProgress =
      connector.lastSyncStartTime !== undefined &&
      (connector.lastSyncFinishTime === undefined ||
        connector.lastSyncStartTime > connector.lastSyncFinishTime);

    if (isSyncInProgress) {
      const firstSyncProgress = connector.firstSyncProgress;
      return (
        <Chip color="info" isBusy>
          {firstSyncProgress ? (
            <Trans>Synchronizing ({firstSyncProgress})</Trans>
          ) : (
            <Trans>Synchronizing</Trans>
          )}
        </Chip>
      );
    } else if (connector.lastSyncSuccessfulTime) {
      return <Chip>{timeAgoFrom(connector.lastSyncSuccessfulTime)}</Chip>;
    } else {
      return (
        <Chip color="info">
          <Trans>Pending</Trans>
        </Chip>
      );
    }
  }
}
