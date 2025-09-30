import type { DropdownMenu, NotificationType } from "@dust-tt/sparkle";
import {
  ArrowPathIcon,
  Button,
  CheckCircleIcon,
  DataTable,
  Icon,
  Input,
  TextArea,
  Tooltip,
  TrashIcon,
  XCircleIcon,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { isLeft } from "fp-ts/lib/Either";
import { useCallback, useState } from "react";

import { useNotionLastSyncedUrls } from "@app/lib/swr/data_sources";
import type { DataSourceType, WorkspaceType } from "@app/types";
import { GetPostNotionSyncResponseBodySchema } from "@app/types";

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
        setError("You can only enter up to 10 URLs");
        return false;
      }
      if (urls.filter((url) => url.trim()).length === 0) {
        setError("You must enter at least one URL");
        return false;
      }
      if (
        !urls.every((url) => url.includes("notion.so") && URL.canParse(url))
      ) {
        setError(
          `Invalid Notion URL format: ${
            urls.filter(
              (url) => !url.includes("notion.so") || !URL.canParse(url)
            )[0]
          }`
        );
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
        setError("One or more URL(s) were synced less than 20 minutes ago");
        return false;
      }
      setError(undefined);
      return true;
    },
    [lastSyncedUrls]
  );

  const columns = [
    {
      header: "Time",
      accessorKey: "timestamp",
      cell: (info: CellContext<TableData, string>) => (
        <DataTable.CellContent>
          {new Date(info.row.original.timestamp).toLocaleTimeString("en-US", {
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
    { header: "URL", accessorKey: "url" },
    {
      header: "Status",
      accessorKey: "success",
      cell: (info: CellContext<TableData, boolean>) => (
        <DataTable.CellContent>
          <div className="flex items-center gap-2">
            {info.row.original.method === "delete" ? (
              <Icon visual={TrashIcon} size="sm" />
            ) : (
              <Icon visual={ArrowPathIcon} size="sm" />
            )}

            {info.row.original.success ? (
              <Icon
                visual={CheckCircleIcon}
                size="sm"
                className="text-success-500"
              />
            ) : (
              <Icon
                visual={XCircleIcon}
                size="sm"
                className="text-warning-500"
              />
            )}
          </div>
        </DataTable.CellContent>
      ),
      meta: {
        className: "w-16",
      },
    },
    {
      header: "Error",
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
        title: "Invalid URL",
        description: "Please enter a URL to check",
      });
      return;
    }

    if (!statusUrl.includes("notion.so") || !URL.canParse(statusUrl)) {
      sendNotification({
        type: "error",
        title: "Invalid URL",
        description: "Please enter a valid Notion URL",
      });
      return;
    }

    setCheckingStatus(true);
    setUrlStatus(null);

    try {
      const response = await fetch(
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
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Error checking URL status",
        description:
          "An unexpected error occurred while checking the URL status",
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
        const r = await fetch(
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
        const response = GetPostNotionSyncResponseBodySchema.decode(
          await r.json()
        );
        if (isLeft(response)) {
          sendNotification({
            type: "error",
            title: "Error syncing Notion URLs",
            description:
              "An unexpected error occurred while syncing Notion URLs.",
          });
          return;
        }

        const { syncResults } = response.right;

        const successCount = syncResults.filter(
          (result) => result.success
        ).length;

        if (successCount === syncResults.length) {
          sendNotification({
            type: "success",
            title: "Sync started",
            description: `The Notion URLs should be ${method === "delete" ? "deleted" : "synced"} shortly.`,
          });
        } else {
          sendNotification({
            type: "error",
            title: `Synced ${successCount} of ${syncResults.length} URLs`,
            description: `Some URLs were not ${method === "delete" ? "deleted" : "synced"} due to errors.`,
          });
        }
        await mutate();
      }
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Error syncing Notion URLs",
        description: `An unexpected error occurred while ${method === "delete" ? "deleted" : "synced"} Notion URLs.`,
      });
    }
    setSyncing(false);
  }

  return (
    <>
      <div className="heading-xl p-1">Advanced Notion Management</div>

      {/* URL Status Check Section */}
      <div className="mb-8 border-b pb-6">
        <div className="heading-md p-1">Check Notion URL Status</div>
        <div className="text-element-700 p-1 text-sm">
          Check if a URL exists in Notion and whether it's synced to Dust
        </div>

        <div className="p-1">
          <Input
            placeholder="https://www.notion.so/..."
            value={statusUrl}
            onChange={(e) => setStatusUrl(e.target.value)}
            className="w-full"
          />
          <div className="mt-2">
            <Button
              label="Check Status"
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
                <span className="font-medium">Notion:</span>{" "}
                {urlStatus.notion.exists ? (
                  <>
                    <Icon
                      visual={CheckCircleIcon}
                      size="xs"
                      className="inline text-success-500"
                    />{" "}
                    Exists ({urlStatus.notion.type})
                  </>
                ) : (
                  <>
                    <Icon
                      visual={XCircleIcon}
                      size="xs"
                      className="inline text-warning-500"
                    />{" "}
                    Not found
                  </>
                )}
              </div>
              <div>
                <span className="font-medium">Dust:</span>{" "}
                {urlStatus.dust.synced ? (
                  <>
                    <Icon
                      visual={CheckCircleIcon}
                      size="xs"
                      className="inline text-success-500"
                    />{" "}
                    Synced
                    {urlStatus.dust.lastSync && (
                      <span className="text-element-600">
                        {" "}
                        (last sync:{" "}
                        {new Date(urlStatus.dust.lastSync).toLocaleString()})
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Icon
                      visual={XCircleIcon}
                      size="xs"
                      className="inline text-warning-500"
                    />{" "}
                    Not synced
                  </>
                )}
              </div>
              {urlStatus.dust.synced &&
                urlStatus.dust.breadcrumbs &&
                urlStatus.dust.breadcrumbs.length > 0 && (
                  <div className="mt-2">
                    <span className="font-medium">Location:</span>{" "}
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
      <div className="heading-md p-1">Manual URL Sync</div>
      <div className="p-1">
        Enter up to 10 Notion URLs to sync (one per line)
      </div>
      <TextArea
        placeholder="https://www.notion.so/..."
        value={urls.join("\n")}
        onChange={(e) => {
          setUrls(e.target.value.split("\n").map((url) => url.trim()));
        }}
        error={error}
        showErrorLabel={!!error}
      />
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          label="Sync URL(s)"
          variant="primary"
          onClick={() => syncURLs("sync")}
          disabled={syncing}
        />
        <Button
          label="Delete URL(s)"
          variant="primary"
          onClick={() => syncURLs("delete")}
          disabled={syncing}
        />
      </div>
      {/* List of the last 50 synced URLs */}
      {!isLoading && lastSyncedUrls.length > 0 && (
        <>
          <div className="p-1 font-bold">Recent operations</div>
          <div className="p-1 text-xs">
            An{" "}
            <Icon
              visual={CheckCircleIcon}
              size="xs"
              className="inline-block text-success-500"
            />{" "}
            icon indicates operation successfully started, but URLs may take up
            to 20 minutes to sync fully.
          </div>

          <DataTable
            columns={columns}
            data={lastSyncedUrls.map((url) => ({
              ...url,
              url: url.url.replace(/^.*?notion\.so\//, ""),
            }))}
          />
        </>
      )}
    </>
  );
}
