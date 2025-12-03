import { Button, cn } from "@dust-tt/sparkle";
import { Clock, User } from "lucide-react";
import React, { useState } from "react";

import { PluginRunDetailsModal } from "@app/components/poke/plugins/PluginRunDetailsModal";
import { PluginRunStatusChip } from "@app/components/poke/plugins/PluginRunStatusChip";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokePluginRuns } from "@app/poke/swr/plugins";
import type { PluginResourceTarget, PluginRunType } from "@app/types";

interface PluginRunsListProps {
  pluginResourceTarget: PluginResourceTarget;
}

interface PluginRunItemProps {
  run: PluginRunType;
  onClick: () => void;
}

function PluginRunItem({ run, onClick }: PluginRunItemProps) {
  return (
    <div
      className={cn(
        "flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors",
        "hover:bg-gray-50 dark:hover:bg-gray-800"
      )}
      onClick={onClick}
    >
      <div className="flex flex-1 items-center space-x-3">
        <PluginRunStatusChip status={run.status} />
        <div className="flex-1">
          <div className="text-sm font-medium">{run.pluginId}</div>
          <div className="mt-1 flex items-center space-x-2 text-xs text-gray-500">
            <User className="h-3 w-3" />
            <span>{run.author}</span>
            <Clock className="ml-2 h-3 w-3" />
            <span>{formatTimestampToFriendlyDate(run.createdAt)}</span>
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
    <div className="h-full p-4">
      <div className="max-h-96 space-y-2 overflow-y-auto">
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
