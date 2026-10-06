import { clientFetch } from "@app/lib/egress/client";
import { formatDateTime, formatTime } from "@app/lib/i18n/format";
import { useNotionLastSyncedUrls } from "@app/lib/swr/data_sources";
import { GetPostNotionSyncResponseBodySchema } from "@app/types/api/spaces";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import type { DropdownMenu, NotificationType } from "@dust-tt/sparkle";
import {
  Button,
  CheckCircle,
  DataTable,
  Icon,
  Input,
  RefreshCw02,
  TextArea,
  Tooltip,
  Trash01,
  XCircle,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CellContext } from "@tanstack/react-table";
import { useCallback, useState } from "react";

// Notion content can be reached through the legacy app domain, the current app domain,
// and published sites.
const VALID_NOTION_HOSTS = ["notion.so", "notion.site", "app.notion.com"];

function isValidNotionUrl(url: string): boolean {
  if (!URL.canParse(url)) {
    return false;
  }
  const { hostname } = new URL(url);
  return VALID_NOTION_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`)
  );
}

interface TableData {
  url: string;
  timestamp: number;
  success: boolean;
  method: "sync" | "delete";
  error_message?: string;
  onClick?: () => void;
  dropdownMenuProps?: React.ComponentPropsWithoutRef<typeof DropdownMenu>;
}

export function AdvancedNotionManagement({
  owner,
  dataSource,
  sendNotification,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  sendNotification: (notification: NotificationType) => void;
}) {
  const { t } = useLingui();
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [syncing, setSyncing] = useState(false);
  const [statusUrl, setStatusUrl] = useState<string>("");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [urlStatus, setUrlStatus] = useState<{
    notion: { exists: boolean; type?: "page" | "database" };
    dust: {
      synced: boolean;
      lastSync?: string;
      breadcrumbs?: Array<{
        id: string;
        title: string;
        type: "page" | "database" | "workspace";
      }>;
    };
    summary: string;
  } | null>(null);

  const { lastSyncedUrls, isLoading, mutate } = useNotionLastSyncedUrls({
    owner,
    dataSource,
  });

  const validateUrls = useCallback(
    (urls: string[]) => {
      if (urls.length > 10) {
        setError(t`You can only enter up to 10 URLs`);
        return false;
      }
      if (urls.filter((url) => url.trim()).length === 0) {
        setError(t`You must enter at least one URL`);
        return false;
      }
      if (!urls.every((url) => isValidNotionUrl(url))) {
        const invalidUrl = urls.filter((url) => !isValidNotionUrl(url))[0];
        setError(t`Invalid Notion URL format: ${invalidUrl}`);
        return false;
      }
      const urlsSyncedLessThan20MinutesAgo = lastSyncedUrls.filter(
        (l) => l.timestamp > Date.now() - 20 * 60 * 1000
      );

      if (
        urls.some((url) =>
          urlsSyncedLessThan20MinutesAgo.some((l) => l.url === url)
        )
      ) {
        setError(t`One or more URLs were synced less than 20 minutes ago`);
        return false;
      }
      setError(undefined);
      return true;
    },
    [lastSyncedUrls, t]
  );

  const columns = [
    {
      header: t`Time`,
      accessorKey: "timestamp",
      cell: (info: CellContext<TableData, string>) => (
        <DataTable.CellContent>
          {formatTime(new Date(info.row.original.timestamp), {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </DataTable.CellContent>
      ),
      meta: {
        className: "w-16",
      },
    },
    { header: t`URL`, accessorKey: "url" },
    {
      header: t`Status`,
      accessorKey: "success",
      cell: (info: CellContext<TableData, boolean>) => (
        <DataTable.CellContent>
          <div className="flex items-center gap-2">
            {info.row.original.method === "delete" ? (
              <Icon visual={Trash01} size="sm" />
            ) : (
              <Icon visual={RefreshCw02} size="sm" />
            )}

            {info.row.original.success ? (
              <Icon
                visual={CheckCircle}
                size="sm"
                className="text-success-500"
              />
            ) : (
              <Icon visual={XCircle} size="sm" className="text-warning-500" />
            )}
          </div>
        </DataTable.CellContent>
      ),
      meta: {
        className: "w-16",
      },
    },
    {
      header: t`Error`,
      accessorKey: "error_message",
      cell: (info: CellContext<TableData, string>) => (
        <DataTable.CellContent>
          <Tooltip
            trigger={
              <span className="truncate">
                {info.row.original.error_message}
              </span>
            }
            label={info.row.original.error_message}
          />
        </DataTable.CellContent>
      ),
      meta: {
        className: "w-32",
      },
    },
  ];

  async function checkUrlStatus() {
    if (!statusUrl.trim()) {
      sendNotification({
        type: "error",
        title: t`Invalid URL`,
        description: t`Please enter a URL to check`,
      });
      return;
    }

    if (!isValidNotionUrl(statusUrl)) {
      sendNotification({
        type: "error",
        title: t`Invalid URL`,
        description: t`Please enter a valid Notion URL`,
      });
      return;
    }

    setCheckingStatus(true);
    setUrlStatus(null);

    try {
      const response = await clientFetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/notion_url_status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: statusUrl }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to check URL status");
      }

      const data = await response.json();
      setUrlStatus({
        notion: data.notion,
        dust: data.dust,
        summary: data.summary,
      });
    } catch {
      sendNotification({
        type: "error",
        title: t`Error checking URL status`,
        description: t`An unexpected error occurred while checking the URL status`,
      });
    }
    setCheckingStatus(false);
  }

  async function syncURLs(method: "sync" | "delete") {
    setSyncing(true);
    // Remove empty strings and duplicates
    const trimmedUrls = [...new Set(urls.filter((url) => url.trim()))];

    try {
      if (trimmedUrls.length && validateUrls(trimmedUrls)) {
        const r = await clientFetch(
          `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/notion_url_sync`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              urls: trimmedUrls,
              method,
            }),
          }
        );

        if (!r.ok) {
          const error: { error: { message: string } } = await r.json();
          throw new Error(error.error.message);
        }
        const response = GetPostNotionSyncResponseBodySchema.safeParse(
          await r.json()
        );
        if (!response.success) {
          sendNotification({
            type: "error",
            title: t`Error syncing Notion URLs`,
            description: t`An unexpected error occurred while syncing Notion URLs.`,
          });
          return;
        }

        const { syncResults } = response.data;

        const successCount = syncResults.filter(
          (result) => result.success
        ).length;
        const totalCount = syncResults.length;

        if (successCount === syncResults.length) {
          sendNotification({
            type: "success",
            title: t`Sync started`,
            description:
              method === "delete"
                ? t`The Notion URLs should be deleted shortly.`
                : t`The Notion URLs should be synced shortly.`,
          });
        } else {
          sendNotification({
            type: "error",
            title: t`${plural(totalCount, {
              one: `Synced ${successCount} of # URL`,
              other: `Synced ${successCount} of # URLs`,
            })}`,
            description:
              method === "delete"
                ? t`Some URLs were not deleted due to errors.`
                : t`Some URLs were not synced due to errors.`,
          });
        }
        await mutate();
      }
    } catch {
      sendNotification({
        type: "error",
        title: t`Error syncing Notion URLs`,
        description:
          method === "delete"
            ? t`An unexpected error occurred while deleting Notion URLs.`
            : t`An unexpected error occurred while syncing Notion URLs.`,
      });
    }
    setSyncing(false);
  }

  const notionType = urlStatus?.notion.type;
  const lastSyncDate = urlStatus?.dust.lastSync
    ? formatDateTime(new Date(urlStatus.dust.lastSync))
    : null;

  return (
    <>
      <div className="heading-xl p-1">
        <Trans>Advanced Notion management</Trans>
      </div>

      {/* URL Status Check Section */}
      <div className="mb-8 border-b pb-6">
        <div className="heading-md p-1">
          <Trans>Check Notion URL status</Trans>
        </div>
        <div className="text-element-700 p-1 text-sm">
          <Trans>
            Check if a URL exists in Notion and whether it's synced to Dust
          </Trans>
        </div>

        <div className="p-1">
          <Input
            placeholder="https://app.notion.com/p/..."
            value={statusUrl}
            onChange={(e) => setStatusUrl(e.target.value)}
            className="w-full"
          />
          <div className="mt-2">
            <Button
              label={t`Check status`}
              variant="primary"
              onClick={checkUrlStatus}
              disabled={checkingStatus}
            />
          </div>
        </div>

        {urlStatus && (
          <div className="bg-structure-50 mt-4 rounded-lg p-4">
            <div className="mb-2 font-medium">{urlStatus.summary}</div>
            <div className="space-y-1 text-sm">
              <div>
                <span className="font-medium">
                  <Trans>Notion:</Trans>
                </span>{" "}
                {urlStatus.notion.exists ? (
                  <>
                    <Icon
                      visual={CheckCircle}
                      size="xs"
                      className="inline text-success-500"
                    />{" "}
                    <Trans>Exists ({notionType})</Trans>
                  </>
                ) : (
                  <>
                    <Icon
                      visual={XCircle}
                      size="xs"
                      className="inline text-warning-500"
                    />{" "}
                    <Trans>Not found</Trans>
                  </>
                )}
              </div>
              <div>
                <span className="font-medium">
                  <Trans>Dust:</Trans>
                </span>{" "}
                {urlStatus.dust.synced ? (
                  <>
                    <Icon
                      visual={CheckCircle}
                      size="xs"
                      className="inline text-success-500"
                    />{" "}
                    <Trans>Synced</Trans>
                    {lastSyncDate && (
                      <span className="text-element-600">
                        {" "}
                        <Trans>(last sync: {lastSyncDate})</Trans>
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Icon
                      visual={XCircle}
                      size="xs"
                      className="inline text-warning-500"
                    />{" "}
                    <Trans>Not synced</Trans>
                  </>
                )}
              </div>
              {urlStatus.dust.synced &&
                urlStatus.dust.breadcrumbs &&
                urlStatus.dust.breadcrumbs.length > 0 && (
                  <div className="mt-2">
                    <span className="font-medium">
                      <Trans>Location:</Trans>
                    </span>{" "}
                    <span className="text-element-600">
                      {urlStatus.dust.breadcrumbs.map((crumb, index) => (
                        <span key={crumb.id}>
                          {index > 0 && " › "}
                          {crumb.title}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
            </div>
          </div>
        )}
      </div>

      {/* Manual URL Sync Section */}
      <div className="heading-md p-1">
        <Trans>Manual URL sync</Trans>
      </div>
      <div className="p-1">
        <Trans>Enter up to 10 Notion URLs to sync (one per line)</Trans>
      </div>
      <TextArea
        placeholder="https://app.notion.com/p/..."
        value={urls.join("\n")}
        onChange={(e) => {
          setUrls(e.target.value.split("\n").map((url) => url.trim()));
        }}
        error={error}
        showErrorLabel={!!error}
      />
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          label={t`Sync URLs`}
          variant="primary"
          onClick={() => syncURLs("sync")}
          disabled={syncing}
        />
        <Button
          label={t`Delete URLs`}
          variant="primary"
          onClick={() => syncURLs("delete")}
          disabled={syncing}
        />
      </div>
      {/* List of the last 50 synced URLs */}
      {!isLoading && lastSyncedUrls.length > 0 && (
        <>
          <div className="p-1 font-bold">
            <Trans>Recent operations</Trans>
          </div>
          <div className="p-1 text-xs">
            <Trans>
              An{" "}
              <Icon
                visual={CheckCircle}
                size="xs"
                className="inline-block text-success-500"
              />{" "}
              icon indicates operation successfully started, but URLs may take
              up to 20 minutes to sync fully.
            </Trans>
          </div>

          <DataTable
            columns={columns}
            data={lastSyncedUrls.map((url) => ({
              ...url,
              url: url.url.replace(/^.*?notion\.(so|site|com)\//, ""),
            }))}
          />
        </>
      )}
    </>
  );
}
