import type {
  DropdownMenu,
  DropdownMenuItemProps,
  NotificationType,
} from "@dust-tt/sparkle";
import {
  ArrowPathIcon,
  Button,
  CheckCircleIcon,
  DataTable,
  Icon,
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
  moreMenuItems?: DropdownMenuItemProps[];
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
      <div className="heading-xl p-1">
        Advanced Notion Management - Manual URL sync
      </div>

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
