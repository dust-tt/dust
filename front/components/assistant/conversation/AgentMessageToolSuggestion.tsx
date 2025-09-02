import { Avatar, Button, CheckIcon } from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useState } from "react";
import { getAvatar, getAvatarFromIcon } from "@app/lib/actions/mcp_icons";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";

export type ToolSuggestion = {
  id: string;
  name?: string;
  type?: string;
  reason?: string;
};

export function AgentMessageToolSuggestion({
  tools,
  currentTools = [],
  onAddTool,
  messageId,
}: {
  tools: ToolSuggestion[];
  currentTools?: string[];
  onAddTool?: (tool: ToolSuggestion) => Promise<boolean> | boolean;
  messageId: string;
}) {
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const { mcpServerViews } = useMCPServerViewsContext();

  const normalizedCurrent = useMemo(
    () => new Set(currentTools.map((t) => t.trim().toLowerCase())),
    [currentTools]
  );

  // If a tool was previously marked as added but is no longer present in the
  // currentTools (e.g., user removed it from the editor), clear its added flag
  // so the button becomes active again.
  useEffect(() => {
    setAddedIds((prev) => prev.filter((id) => normalizedCurrent.has(id.toLowerCase())));
  }, [normalizedCurrent]);

  const handleAdd = async (tool: ToolSuggestion) => {
    if (!onAddTool) return;
    const ok = await onAddTool(tool);
    if (ok) {
      setAddedIds((prev) => [...prev, tool.id]);
    }
  };

  return (
    <div className="mt-4 space-y-3" data-message-id={messageId}>
      {tools.map((tool, idx) => {
        const id = tool.id.trim().toLowerCase();
        const isKnowledgeTool = new Set([
          "search",
          "include_data",
          "extract_data",
          "query_tables",
        ]).has(id);
        const isAlready = normalizedCurrent.has(id);
        const isAdded = addedIds.includes(tool.id);
        // Disable only if it's already present in the form. If user removed it,
        // re-enable even if we had shown "Added!" earlier.
        const disabled = isAlready || !onAddTool;
        const buttonLabel = isAlready
          ? "Added"
          : isKnowledgeTool
          ? "Add knowledge"
          : "Add tool";

        const view =
          mcpServerViews.find((v) => v.server.name?.toLowerCase() === id) || null;
        let iconEl: React.ReactNode = null;
        if (id === "data_visualization") {
          iconEl = <Avatar icon={DATA_VISUALIZATION_SPECIFICATION.cardIcon} size="xs" />;
        } else if (view) {
          iconEl = getAvatar(view.server, "xs");
        } else if (INTERNAL_MCP_SERVERS[id as keyof typeof INTERNAL_MCP_SERVERS]) {
          const iconName = (INTERNAL_MCP_SERVERS as any)[id]?.serverInfo?.icon;
          if (iconName) {
            iconEl = getAvatarFromIcon(iconName, "xs");
          }
        }

        return (
          <div
            key={`${tool.id}-${idx}`}
            className="rounded-lg border border-separator bg-slate-50 dark:bg-slate-900/10"
          >
            <div className="flex items-center justify-between border-b border-separator px-4 py-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                {iconEl}
                <span>{tool.name || tool.id}</span>
              </div>
              <div>
                <Button
                  size="xs"
                  variant="primary"
                  icon={CheckIcon}
                  tooltip={buttonLabel}
                  disabled={disabled}
                  onClick={() => handleAdd(tool)}
                />
              </div>
            </div>
            {tool.reason && (
              <div className="p-3">
                <p className="text-sm text-slate-700 dark:text-slate-300">{tool.reason}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
