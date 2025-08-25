import { Chip } from "@dust-tt/sparkle";
import React from "react";

import type { SelectedTool } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import {
  getSelectedToolIcon,
  getSelectedToolLabel,
} from "@app/components/agent_builder/capabilities/mcp/utils/toolDisplayUtils";
import type { ActionSpecification } from "@app/components/agent_builder/types";

interface MCPServerViewsFooterProps {
  selectedToolsInSheet: SelectedTool[];
  dataVisualization?: ActionSpecification | null;
  onRemoveSelectedTool?: (tool: SelectedTool) => void;
}

export function MCPServerViewsFooter({
  selectedToolsInSheet,
  dataVisualization,
  onRemoveSelectedTool,
}: MCPServerViewsFooterProps) {
  return (
    <>
      {selectedToolsInSheet.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Selected tools</h2>
          <div className="flex flex-wrap gap-2">
            {selectedToolsInSheet.map((tool, index) => (
              <Chip
                key={index}
                icon={getSelectedToolIcon(tool)}
                label={getSelectedToolLabel(tool, dataVisualization)}
                onRemove={
                  onRemoveSelectedTool
                    ? () => onRemoveSelectedTool(tool)
                    : undefined
                }
                size="xs"
                color="green"
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
