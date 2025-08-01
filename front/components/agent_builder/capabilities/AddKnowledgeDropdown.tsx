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

import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface AddKnowledgeDropdownProps {
  mcpServerViewsWithKnowledge: (MCPServerViewType & { label: string })[];
  onItemClick: (serverName: string) => void;
  isMCPServerViewsLoading: boolean;
}

export function AddKnowledgeDropdown({
  mcpServerViewsWithKnowledge = [],
  onItemClick,
  isMCPServerViewsLoading,
}: AddKnowledgeDropdownProps) {
  const handleDropdownItemClick = (view: MCPServerViewType) => {
    onItemClick(view.server.name);
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button label="Add knowledge" size="sm" icon={BookOpenIcon} isSelect />
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
              description={view.server.description}
              onClick={() => handleDropdownItemClick(view)}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
