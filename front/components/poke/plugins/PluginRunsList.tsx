import { PluginRunDetailsModal } from "@app/components/poke/plugins/PluginRunDetailsModal";
import { PluginRunStatusChip } from "@app/components/poke/plugins/PluginRunStatusChip";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokePluginRuns } from "@app/poke/swr/plugins";
import type {
  PluginResourceTarget,
  PluginRunType,
} from "@app/types/poke/plugins";
import { Button, cn } from "@dust-tt/sparkle";
import { Clock, User } from "lucide-react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useState } from "react";

interface PluginRunsListProps {
  pluginResourceTarget: PluginResourceTarget;
}

interface PluginRunItemProps {
  run: PluginRunType;
  onClick: () => void;
}

/**
 * @cc [owner:aubin-tchoi,label:react] sidebar-run-history
 * Run metadata wraps and the details action stacks below it in containers narrower
 * than 32rem.
 */
function PluginRunItem({ run, onClick }: PluginRunItemProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 cursor-pointer flex-col items-start justify-between gap-3 rounded-lg border p-4 transition-colors @xs:flex-row @xs:items-center",
        "hover:bg-primary-50"
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-center gap-3 @xs:flex-1">
        <PluginRunStatusChip status={run.status} />
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-medium">{run.pluginId}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex min-w-0 items-center gap-1">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{run.author}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatTimestampToFriendlyDate(run.createdAt)}</span>
            </span>
          </div>
        </div>
      </div>
      <Button
        variant="outline"
        size="xs"
        onClick={onClick}
        label="View Details"
      />
    </div>
  );
}

export function PluginRunsList({ pluginResourceTarget }: PluginRunsListProps) {
  const [selectedRun, setSelectedRun] = useState<PluginRunType | null>(null);

  // Build the API options based on the target type
  const isGlobalLevel = pluginResourceTarget.resourceType === "global";
  const isWorkspaceLevel = pluginResourceTarget.resourceType === "workspaces";

  const apiOptions: Parameters<typeof usePokePluginRuns>[0] = {};

  if (!isGlobalLevel && "workspace" in pluginResourceTarget) {
    apiOptions.owner = pluginResourceTarget.workspace;
  }

  if (!isWorkspaceLevel && !isGlobalLevel) {
    apiOptions.resourceType = pluginResourceTarget.resourceType;
    if ("resourceId" in pluginResourceTarget) {
      apiOptions.resourceId = pluginResourceTarget.resourceId;
    }
  }

  const {
    data: pluginRuns,
    isLoading,
    isError,
  } = usePokePluginRuns(apiOptions);

  const handleRunSelect = (run: PluginRunType) => {
    setSelectedRun(run);
  };

  const handleModalClose = () => {
    setSelectedRun(null);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-gray-500">
        <p>Loading plugin runs...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-red-500">
        <p>Error loading plugin runs.</p>
      </div>
    );
  }

  if (pluginRuns.length === 0) {
    const contextMessage = isGlobalLevel
      ? "No global plugin runs found."
      : isWorkspaceLevel
        ? "No plugin runs found for this workspace."
        : "No plugin runs found for this resource.";

    return (
      <div className="flex h-full items-center justify-center p-4 text-gray-500">
        <p>{contextMessage}</p>
      </div>
    );
  }

  return (
    <div className="h-full @container">
      <div className="max-h-96 space-y-2 overflow-y-auto p-4">
        {pluginRuns.map((run) => (
          <PluginRunItem
            key={`${run.pluginId}-${run.createdAt}`}
            run={run}
            onClick={() => handleRunSelect(run)}
          />
        ))}
      </div>
      {selectedRun && (
        <PluginRunDetailsModal run={selectedRun} onClose={handleModalClose} />
      )}
    </div>
  );
}
