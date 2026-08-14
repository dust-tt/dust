import {
  useConsumptionExports,
  useStartConsumptionExport,
} from "@app/hooks/useConsumptionExports";
import type { ConsumptionExportListItem } from "@app/lib/api/analytics/consumption/export_jobs";
import type { ConsumptionExportBody } from "@app/lib/api/analytics/consumption/schema";
import {
  Button,
  Download01,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface ConsumptionExportPanelProps {
  workspaceId: string;
  exportBody: ConsumptionExportBody;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ConsumptionExportRow({ item }: { item: ConsumptionExportListItem }) {
  return (
    <a
      href={item.downloadUrl}
      className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 hover:bg-muted-background"
    >
      <span className="text-sm text-foreground">
        {new Date(item.createdAt).toLocaleString()}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatFileSize(item.sizeBytes)}
      </span>
    </a>
  );
}

export function ConsumptionExportPanel({
  workspaceId,
  exportBody,
}: ConsumptionExportPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { exports, isGenerating, isConsumptionExportsLoading } =
    useConsumptionExports({ workspaceId, disabled: !isOpen });
  const { isStarting, startConsumptionExport } = useStartConsumptionExport({
    workspaceId,
  });

  // Opening the panel with no past export and nothing already generating starts one
  // automatically, so the user doesn't have to find a separate "generate" action.
  useEffect(() => {
    if (
      isOpen &&
      !isConsumptionExportsLoading &&
      !isGenerating &&
      !isStarting &&
      exports.length === 0
    ) {
      void startConsumptionExport(exportBody);
    }
  }, [
    isOpen,
    isConsumptionExportsLoading,
    isGenerating,
    isStarting,
    exports.length,
    exportBody,
    startConsumptionExport,
  ]);

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          icon={Download01}
          label="Download raw data"
          variant="outline"
          size="sm"
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            Raw data exports
          </span>
          {isConsumptionExportsLoading ? (
            <div className="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : exports.length > 0 ? (
            <div className="flex flex-col">
              {exports.map((item) => (
                <ConsumptionExportRow key={item.name} item={item} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-4">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Generating your export…
              </span>
            </div>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
