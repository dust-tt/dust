import {
  BookOpenIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { AddSearchSheet } from "@app/components/agent_builder/capabilities/knowledge/AddSearchSheet";
import { isSearchServer } from "@app/components/agent_builder/capabilities/knowledge/utils";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface AddKnowledgeDropdownProps {
  mcpServerViewsWithKnowledge: (MCPServerViewType & { label: string })[];
  onKnowledgeAdd: () => void;
}

export function AddKnowledgeDropdown({
  mcpServerViewsWithKnowledge = [],
  onKnowledgeAdd,
}: AddKnowledgeDropdownProps) {
  const [isSearchSheetOpen, setIsSearchSheetOpen] = useState(false);

  const handleDropdownItemClick = (view: MCPServerViewType) => {
    if (isSearchServer(view)) {
      setIsSearchSheetOpen(true);
    }
  };

  const handleSearchSheetSave = () => {
    setIsSearchSheetOpen(false);
    onKnowledgeAdd();
  };

  const handleSearchSheetClose = () => {
    setIsSearchSheetOpen(false);
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            label="Add knowledge"
            size="sm"
            icon={BookOpenIcon}
            isSelect
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {mcpServerViewsWithKnowledge.map((view) => (
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

      <AddSearchSheet
        onKnowledgeAdd={handleSearchSheetSave}
        isOpen={isSearchSheetOpen}
        onClose={handleSearchSheetClose}
      />
    </>
  );
}
