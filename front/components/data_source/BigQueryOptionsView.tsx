import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import {
  BigQueryLogo,
  Button,
  ContextItem,
  Input,
  SliderToggle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

const BYTES_PER_GB = 1024 ** 3;

function bytesToGbInput(bytesConfigValue: string | null): string {
  if (!bytesConfigValue || bytesConfigValue === "0") {
    return "";
  }
  const bytes = Number(bytesConfigValue);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  return String(bytes / BYTES_PER_GB);
}

export function BigQueryOptionsView({
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
  const [dbmlLoading, setDbmlLoading] = useState(false);
  const [bytesLoading, setBytesLoading] = useState(false);
  const [gbInput, setGbInput] = useState("");

  const {
    configValue: useMetadataForDBMLValue,
    mutateConfig: mutateDbmlConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "useMetadataForDBML",
  });
  const useMetadataForDBML = useMetadataForDBMLValue === "true";

  const {
    configValue: maximumBytesBilledValue,
    mutateConfig: mutateMaximumBytesBilledConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "maximumBytesBilled",
  });

  useEffect(() => {
    setGbInput(bytesToGbInput(maximumBytesBilledValue));
  }, [maximumBytesBilledValue]);

  const handleSetUseMetadataForDBML = async (enabled: boolean) => {
    setDbmlLoading(true);
    const res = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/useMetadataForDBML`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: enabled.toString() }),
      }
    );
    if (res.ok) {
      await mutateDbmlConfig();
      setDbmlLoading(false);
    } else {
      setDbmlLoading(false);
      const err: unknown = await res.json();
      sendApiErrorNotification({
        title: t`Failed to enable BigQuery use metadata for DBML`,
        error: err,
      });
    }
  };

  const handleSaveMaximumBytesBilled = async () => {
    const trimmed = gbInput.trim();
    if (trimmed !== "" && trimmed !== "0") {
      const gb = Number(trimmed);
      if (!Number.isFinite(gb) || gb < 0) {
        sendNotification({
          type: "info",
          title: t`Invalid maximum bytes billed`,
          description: t`Enter a non-negative number of GB, or leave empty for no limit.`,
        });
        return;
      }
    }

    const bytesValue =
      trimmed === "" || trimmed === "0"
        ? ""
        : String(Math.round(Number(trimmed) * BYTES_PER_GB));

    setBytesLoading(true);
    const res = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/maximumBytesBilled`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: bytesValue }),
      }
    );
    if (res.ok) {
      await mutateMaximumBytesBilledConfig();
      setBytesLoading(false);
      sendNotification({
        type: "success",
        title: t`Maximum bytes billed updated`,
        description:
          bytesValue === ""
            ? t`No limit will be applied to BigQuery queries.`
            : t`Queries will be limited to ${trimmed} GB billed.`,
      });
    } else {
      setBytesLoading(false);
      const err: unknown = await res.json();
      sendApiErrorNotification({
        title: t`Failed to update maximum bytes billed`,
        error: err,
      });
    }
  };

  const savedGbInput = bytesToGbInput(maximumBytesBilledValue);
  const isBytesUnchanged = gbInput === savedGbInput;

  return (
    <ContextItem.List>
      <ContextItem
        title={t`Use descriptions`}
        visual={<ContextItem.Visual visual={BigQueryLogo} />}
        action={
          <div className="relative">
            <SliderToggle
              onClick={async () => {
                await handleSetUseMetadataForDBML(!useMetadataForDBML);
              }}
              selected={useMetadataForDBML}
              disabled={readOnly || !isAdmin || dbmlLoading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-muted-foreground">
            <Trans>
              Your tables and columns description set in BigQuery will be used
              to describe the schemas to Agents.
            </Trans>
          </div>
        </ContextItem.Description>
      </ContextItem>

      <ContextItem
        title={t`Maximum bytes billed`}
        visual={<ContextItem.Visual visual={BigQueryLogo} />}
      >
        <ContextItem.Description>
          <div className="mb-4 flex items-start justify-between gap-4 text-muted-foreground">
            <div className="text-sm text-muted-foreground">
              <Trans>
                Cap how many bytes a Dust-run BigQuery query may bill. Leave
                empty or 0 for no limit.
              </Trans>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={gbInput}
                type="number"
                onChange={(e) => setGbInput(e.target.value)}
                disabled={readOnly || !isAdmin || bytesLoading}
                placeholder={t`No limit`}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                <Trans context="gigabytes unit">GB</Trans>
              </span>
              <Button
                size="sm"
                onClick={handleSaveMaximumBytesBilled}
                disabled={
                  readOnly || !isAdmin || bytesLoading || isBytesUnchanged
                }
                label={t`Save`}
              />
            </div>
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
