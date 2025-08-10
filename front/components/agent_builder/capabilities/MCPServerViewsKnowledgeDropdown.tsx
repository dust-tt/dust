import {
  BookOpenIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import React from "react";

import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface MCPServerViewsKnowledgeDropdownProps {
  mcpServerViewsWithKnowledge: (MCPServerViewType & { label: string })[];
  onItemClick: (mcpServerView: MCPServerViewType) => void;
  isMCPServerViewsLoading: boolean;
  selectedMcpServerView?: MCPServerViewType | null;
}

export function MCPServerViewsKnowledgeDropdown({
  mcpServerViewsWithKnowledge = [],
  onItemClick,
  isMCPServerViewsLoading,
  selectedMcpServerView,
}: MCPServerViewsKnowledgeDropdownProps) {
  const handleDropdownItemClick = (view: MCPServerViewType) => {
    onItemClick(view);
  };

  const icon =
    selectedMcpServerView && getAvatar(selectedMcpServerView.server, "sm")
      ? () => getAvatar(selectedMcpServerView.server, "xs")
      : BookOpenIcon;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label={
            selectedMcpServerView
              ? getMcpServerViewDisplayName(selectedMcpServerView)
              : "Select knowledge type"
          }
          icon={icon}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="md-w-100 w-80">
        {isMCPServerViewsLoading && (
          <div className="flex h-40 w-full items-center justify-center rounded-xl">
            <Spinner />
          </div>
        )}
        {!isMCPServerViewsLoading &&
          mcpServerViewsWithKnowledge.map((view) => (
            <DropdownMenuItem
              truncateText
              key={view.id}
              icon={getAvatar(view.server, "sm")}
              label={view.label}
              description={getMcpServerViewDescription(view)}
              onClick={() => handleDropdownItemClick(view)}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
