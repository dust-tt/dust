import {
  Button,
  ContextItem,
  Input,
  ZendeskLogo,
  ZendeskWhiteLogo,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { ZENDESK_CONFIG_KEYS } from "@app/lib/constants/zendesk";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType, WorkspaceType } from "@app/types";

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
  const { isDark } = useTheme();
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        title: "Rate limit transactions per second updated",
        description: `The rate limit transactions per second has been updated to ${configValue}.`,
      });
    } else {
      setLoading(false);
      const err = await res.json();
      sendNotification({
        type: "info",
        title: "Failed to edit Zendesk configuration",
        description:
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          err.error?.connectors_error.message || "An unknown error occurred",
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
        title: "Invalid rate limit transactions per second",
        description:
          "Rate limit transactions per second must be a positive integer.",
      });
      return;
    }

    await handleSetNewConfig(ZENDESK_CONFIG_KEYS.RATE_LIMIT_TPS, numValue);
  };

  return (
    <ContextItem
      title="Rate Limit Transactions Per Second"
      visual={
        <ContextItem.Visual visual={isDark ? ZendeskWhiteLogo : ZendeskLogo} />
      }
    >
      <ContextItem.Description>
        <div className="mb-4 flex items-start justify-between gap-4 text-muted-foreground dark:text-muted-foreground-night">
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Set a transaction-per-second limit to manage Zendesk rate
            restrictions. Leave empty to disable.
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={rateLimitInput}
              type="number"
              onChange={(e) => setRateLimitInput(e.target.value)}
              disabled={readOnly || !isAdmin || loading}
              placeholder={
                rateLimitTransactionsPerSecond
                  ? `${rateLimitTransactionsPerSecond} tps`
                  : "Disabled"
              }
              className="w-24"
            />
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              transactions per second
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
              label="Save"
            />
          </div>
        </div>
      </ContextItem.Description>
    </ContextItem>
  );
}
