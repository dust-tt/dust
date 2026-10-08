import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { ZENDESK_CONFIG_KEYS } from "@app/lib/constants/zendesk";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import { Button, ContextItem, Input, ZendeskLogo } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

export function ZendeskRateLimitConfig({
  owner,
  readOnly,
  isAdmin,
  dataSource,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [loading, setLoading] = useState(false);
  const [rateLimitInput, setRateLimitInput] = useState("");

  const {
    configValue: rateLimitTransactionsPerSecond,
    mutateConfig: mutateRateLimitConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: ZENDESK_CONFIG_KEYS.RATE_LIMIT_TPS,
  });

  // Initialize input state based on current config
  useEffect(() => {
    if (rateLimitTransactionsPerSecond) {
      setRateLimitInput(rateLimitTransactionsPerSecond);
    } else {
      setRateLimitInput("");
    }
  }, [rateLimitTransactionsPerSecond]);

  const handleSetNewConfig = async (
    configKey: string,
    configValue: number | string
  ) => {
    setLoading(true);
    const res = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${configKey}`,
      {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ configValue: configValue.toString() }),
      }
    );
    if (res.ok) {
      await mutateRateLimitConfig();
      setLoading(false);
      sendNotification({
        type: "success",
        title: t`Rate limit transactions per second updated`,
        description: t`The rate limit transactions per second has been updated to ${configValue}.`,
      });
    } else {
      setLoading(false);
      const err: unknown = await res.json();
      sendApiErrorNotification({
        title: t`Failed to edit Zendesk configuration`,
        error: err,
      });
    }
    return true;
  };

  const handleSave = async () => {
    const value = rateLimitInput.trim();

    if (value === "") {
      // Empty value means disable rate limiting
      await handleSetNewConfig(ZENDESK_CONFIG_KEYS.RATE_LIMIT_TPS, "");
      return;
    }

    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 1) {
      sendNotification({
        type: "info",
        title: t`Invalid rate limit transactions per second`,
        description: t`Rate limit transactions per second must be a positive integer.`,
      });
      return;
    }

    await handleSetNewConfig(ZENDESK_CONFIG_KEYS.RATE_LIMIT_TPS, numValue);
  };

  return (
    <ContextItem
      title={t`Rate limit transactions per second`}
      visual={<ContextItem.Visual visual={ZendeskLogo} />}
    >
      <ContextItem.Description>
        <div className="mb-4 flex items-start justify-between gap-4 text-muted-foreground">
          <div className="text-sm text-muted-foreground">
            <Trans>
              Set a transaction-per-second limit to manage Zendesk rate
              restrictions. Leave empty to disable.
            </Trans>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={rateLimitInput}
              type="number"
              onChange={(e) => setRateLimitInput(e.target.value)}
              disabled={readOnly || !isAdmin || loading}
              placeholder={
                rateLimitTransactionsPerSecond
                  ? t`${rateLimitTransactionsPerSecond} tps`
                  : t`Disabled`
              }
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">
              <Trans>transactions per second</Trans>
            </span>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                readOnly ||
                !isAdmin ||
                loading ||
                rateLimitInput === rateLimitTransactionsPerSecond?.toString()
              }
              label={t`Save`}
            />
          </div>
        </div>
      </ContextItem.Description>
    </ContextItem>
  );
}
