import { useNotionLastSyncedUrls } from "@app/lib/swr/data_sources";
import type {
  DropdownMenu,
  DropdownMenuItemProps,
  NotificationType,
} from "@dust-tt/sparkle";
import { Button, DataTable, TextArea } from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import { CellContext } from "@tanstack/react-table";
import { useMemo, useState } from "react";

interface TableData {
  url: string;
  timestamp: number;
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

  const validateUrls = (urls: string[]) => {
    if (urls.length > 10) {
      setError("You can only enter up to 10 URLs");
      return false;
    }
    if (urls.filter((url) => url.trim()).length === 0) {
      setError("You must enter at least one URL");
      return false;
    }
    if (!urls.every((url) => url.includes("notion.so") && URL.canParse(url))) {
      setError(
        `Invalid Notion URL format: ${
          urls.filter(
            (url) => !url.includes("notion.so") || !URL.canParse(url)
          )[0]
        }`
      );
      return false;
    }
    setError(undefined);
    return true;
  };

  const { lastSyncedUrls, isLoading } = useNotionLastSyncedUrls({
    owner,
    dataSource,
  });

  const columns = [
    {
      header: "Time",
      accessorKey: "timestamp",
      cell: (info: CellContext<TableData, string>) => (
        <DataTable.CellContent>
          <div>
            {new Date(info.row.original.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </div>
        </DataTable.CellContent>
      ),
    },
    { header: "URL", accessorKey: "url" },
  ];

  async function syncURLs() {
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
            }),
          }
        );

        if (!r.ok) {
          const error: { error: { message: string } } = await r.json();
          throw new Error(error.error.message);
        }
        sendNotification({
          type: "success",
          title: "Sync started",
          description: "The Notion URLs should be synced shortly.",
        });
      }
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Error syncing Notion URLs",
        description: "An unexpected error occurred while syncing Notion URLs.",
      });
    }
    setSyncing(false);
  }
  console.log("rendering", isLoading, lastSyncedUrls);

  return (
    <>
      <div className="p-1 text-xl font-bold">
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
          onClick={syncURLs}
          disabled={syncing}
        />
      </div>
      {/* List of the last 50 synced URLs */}
      {!isLoading && lastSyncedUrls.length > 0 && (
        <>
          <div className="p-1">Recently synced URLs</div>
          <DataTable columns={columns} data={lastSyncedUrls} />
        </>
      )}
    </>
  );
}
