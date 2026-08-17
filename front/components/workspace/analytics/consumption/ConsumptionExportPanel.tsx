import {
  useConsumptionExports,
  useStartConsumptionExport,
} from "@app/hooks/useConsumptionExports";
import type { ConsumptionExportListItem } from "@app/lib/api/analytics/consumption/export_jobs";
import type { ConsumptionExportBody } from "@app/lib/api/analytics/consumption/schema";
import { formatFileSize } from "@app/lib/utils";
import {
  Button,
  Download01,
  Plus,
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

function ConsumptionExportRow({
  workspaceId,
  item,
}: {
  workspaceId: string;
  item: ConsumptionExportListItem;
}) {
  return (
    <a
      href={`/api/w/${workspaceId}/analytics/consumption/export-raw/${item.name}/download`}
      className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 hover:bg-muted-background"
    >
      <span className="text-sm text-foreground">
        {new Date(item.createdAt).toLocaleString()}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {formatFileSize(item.sizeBytes)}
        <Download01 className="h-3.5 w-3.5" />
      </span>
    </a>
  );
}

export function ConsumptionExportPanel({
  workspaceId,
  exportBody,
}: ConsumptionExportPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasAttemptedAutoStart, setHasAttemptedAutoStart] = useState(false);
  const {
    exports,
    isGenerating,
    isConsumptionExportsLoading,
    isConsumptionExportsError,
  } = useConsumptionExports({ workspaceId, disabled: !isOpen });
  const { isStarting, startConsumptionExport } = useStartConsumptionExport({
    workspaceId,
  });

  // Give the automatic flow one fresh attempt each time the panel is reopened.
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setHasAttemptedAutoStart(false);
    }
  };

  // Opening the panel with no past export and nothing already generating starts one
  // automatically, so the user doesn't have to find a separate "generate" action. This
  // only fires once per time the panel is opened: a workflow that failed or timed out
  // also leaves exports empty with isGenerating false, so without this guard the effect
  // would relaunch an expensive export indefinitely instead of surfacing the failure.
  useEffect(() => {
    if (
      isOpen &&
      !isConsumptionExportsLoading &&
      !isConsumptionExportsError &&
      !isGenerating &&
      !isStarting &&
      !hasAttemptedAutoStart &&
      exports.length === 0
    ) {
      setHasAttemptedAutoStart(true);
      void startConsumptionExport(exportBody);
    }
  }, [
    isOpen,
    isConsumptionExportsLoading,
    isConsumptionExportsError,
    isGenerating,
    isStarting,
    hasAttemptedAutoStart,
    exports.length,
    exportBody,
    startConsumptionExport,
  ]);

  const hasAutoStartFailed =
    hasAttemptedAutoStart &&
    !isGenerating &&
    !isStarting &&
    exports.length === 0;

  return (
    <PopoverRoot open={isOpen} onOpenChange={handleOpenChange}>
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
          <span className="text-xs text-muted-foreground">
            Exports are kept for a maximum of 15 days.
          </span>
          {isConsumptionExportsLoading ? (
            <div className="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : isConsumptionExportsError ? (
            <div className="flex items-center justify-center py-4">
              <span className="text-sm text-muted-foreground">
                Could not load exports.
              </span>
            </div>
          ) : exports.length > 0 ? (
            <div className="flex max-h-40 flex-col overflow-y-auto">
              {exports.map((item) => (
                <ConsumptionExportRow
                  key={item.name}
                  workspaceId={workspaceId}
                  item={item}
                />
              ))}
            </div>
          ) : hasAutoStartFailed ? (
            <div className="flex items-center justify-center py-4">
              <span className="text-sm text-muted-foreground">
                The export failed to generate.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-4">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Generating your export…
              </span>
            </div>
          )}
          {isGenerating && exports.length > 0 && (
            <div className="flex items-center gap-2">
              <Spinner size="xs" />
              <span className="text-xs text-muted-foreground">
                Generating a new export…
              </span>
            </div>
          )}
          <Button
            icon={Plus}
            label="New export"
            variant="outline"
            size="sm"
            disabled={isGenerating || isStarting}
            onClick={() => void startConsumptionExport(exportBody)}
          />
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
