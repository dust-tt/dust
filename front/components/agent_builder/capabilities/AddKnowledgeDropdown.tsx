import {
  BookOpenIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface AddKnowledgeDropdownProps {
  mcpServerViewsWithKnowledge?: (MCPServerViewType & { label: string })[];
}

export function AddKnowledgeDropdown({
  mcpServerViewsWithKnowledge = [],
}: AddKnowledgeDropdownProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button label="Add knowledge" size="sm" icon={BookOpenIcon} isSelect />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {mcpServerViewsWithKnowledge.map((view) => (
          <DropdownMenuItem
            truncateText
            key={view.id}
            icon={getAvatar(view.server)}
            label={view.label}
            description={view.server.description}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
