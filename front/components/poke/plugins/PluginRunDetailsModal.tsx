import {
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { Clock, User } from "lucide-react";
import React from "react";

import {
  getStatusIcon,
  PluginRunStatusChip,
} from "@app/components/poke/plugins/PluginRunStatusChip";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PluginRunType } from "@app/types";
import { safeParseJSON } from "@app/types";

interface PluginRunDetailsModalProps {
  onClose: () => void;
  run: PluginRunType;
}

export function PluginRunDetailsModal({
  run,
  onClose,
}: PluginRunDetailsModalProps) {
  const formatJsonOutput = (data: string | object | null | undefined) => {
    if (!data) {
      return "No data";
    }

    if (typeof data === "string") {
      // Try to parse as JSON first.
      const parsed = safeParseJSON(data);
      if (parsed.isOk() && parsed.value !== null) {
        return JSON.stringify(parsed.value, null, 2);
      }
      // If not JSON or run output was truncated. Return as-is.
      return data;
    }

    return JSON.stringify(data, null, 2);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon(run.status, "lg")}
            Plugin Run Details - {run.pluginId}
          </DialogTitle>
          <DialogDescription>
            Execution details and results for this plugin run
          </DialogDescription>
        </DialogHeader>

        <DialogContainer>
          <div className="space-y-6">
            {/* Status and Metadata */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">
                    Status:
                  </span>
                  <PluginRunStatusChip
                    status={run.status}
                    variant="large"
                    className="border"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-500">
                    Author:
                  </span>
                  <span className="text-sm">{run.author}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-500">
                    Executed:
                  </span>
                  <span className="text-sm">
                    {formatTimestampToFriendlyDate(run.createdAt)}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-gray-500">
                    Resource Type:
                  </span>
                  <span className="ml-2 text-sm">{run.resourceType}</span>
                </div>

                {run.resourceId && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">
                      Resource ID:
                    </span>
                    <span
                      className={cn(
                        "ml-2 rounded bg-gray-100 px-2 py-1 font-mono text-sm text-xs",
                        "dark:bg-gray-800"
                      )}
                    >
                      {run.resourceId}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Input Arguments */}
            <div>
              <h3 className="mb-3 text-lg font-semibold">Input Arguments</h3>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                <pre className="overflow-x-auto whitespace-pre-wrap text-sm">
                  {formatJsonOutput(run.args)}
                </pre>
              </div>
            </div>

            {/* Output/Result */}
            {run.result && (
              <div>
                <h3 className="mb-3 text-lg font-semibold text-green-600">
                  Result
                </h3>
                <div
                  className={cn(
                    "rounded-lg border border-green-200 bg-green-50 p-4",
                    "dark:border-green-800 dark:bg-green-900/20"
                  )}
                >
                  <pre className="overflow-x-auto whitespace-pre-wrap text-sm">
                    {formatJsonOutput(run.result)}
                  </pre>
                </div>
              </div>
            )}

            {/* Error */}
            {run.error && (
              <div>
                <h3 className="mb-3 text-lg font-semibold text-red-600">
                  Error
                </h3>
                <div
                  className={cn(
                    "rounded-lg border border-red-200 bg-red-50 p-4",
                    "dark:border-red-800 dark:bg-red-900/20"
                  )}
                >
                  <pre
                    className={cn(
                      "overflow-x-auto whitespace-pre-wrap text-sm text-red-700 dark:text-red-300"
                    )}
                  >
                    {run.error}
                  </pre>
                </div>
              </div>
            )}

            {/* No result or error for pending */}
            {run.status === "pending" && !run.result && !run.error && (
              <div className="py-8 text-center">
                <Clock className="mx-auto mb-2 h-12 w-12 text-yellow-500" />
                <p className="text-gray-500">
                  This plugin run is still pending execution.
                </p>
              </div>
            )}
          </div>
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
