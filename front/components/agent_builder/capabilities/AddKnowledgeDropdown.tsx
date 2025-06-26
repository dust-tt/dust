import {
  Avatar,
  BookOpenIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

import { getAvatar } from "@app/lib/actions/mcp_icons";
import { ACTION_SPECIFICATIONS } from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";

const DATA_SOURCES_ACTION_CATEGORIES = [
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "PROCESS",
  "TABLES_QUERY",
] as const;

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
        {DATA_SOURCES_ACTION_CATEGORIES.map((key) => {
          const spec = ACTION_SPECIFICATIONS[key];

          return (
            <DropdownMenuItem
              truncateText
              key={key}
              icon={<Avatar icon={spec.dropDownIcon} size="sm" />}
              label={spec.label}
              description={spec.description}
            />
          );
        })}
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
