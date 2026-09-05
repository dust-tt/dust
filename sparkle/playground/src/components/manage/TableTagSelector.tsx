import {
  Button,
  Check,
  ChevronDown,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

import type { AgentTag } from "../../data/manageAgents";

interface TableTagSelectorProps {
  tags: AgentTag[];
  agentTags: AgentTag[];
  onChange: (tags: AgentTag[]) => void;
}

export function TableTagSelector({
  tags,
  agentTags,
  onChange,
}: TableTagSelectorProps) {
  const selectedIds = new Set(agentTags.map((tag) => tag.sId));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {agentTags.length === 0 ? (
          <Button
            variant="ghost"
            size="xs"
            label="Add tags"
            isSelect
            className="invisible text-muted-foreground group-hover:visible"
          />
        ) : (
          <Button
            variant="ghost"
            icon={ChevronDown}
            size="xmini"
            className="invisible text-muted-foreground group-hover:visible"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        mountPortalContainer={document.body}
        className="w-60"
      >
        <DropdownMenuLabel label="Available tags" />
        <DropdownMenuSeparator />
        <DropdownMenuTagList>
          {tags.length === 0 ? (
            <div className="px-2 py-2 text-center text-sm text-muted-foreground">
              No tags available
            </div>
          ) : (
            tags.map((tag) => (
              <DropdownMenuTagItem
                key={tag.sId}
                label={tag.name}
                color="info"
                className="m-0.5"
                icon={selectedIds.has(tag.sId) ? Check : undefined}
                onClick={() => {
                  onChange(
                    selectedIds.has(tag.sId)
                      ? agentTags.filter((t) => t.sId !== tag.sId)
                      : [...agentTags, tag]
                  );
                }}
              />
            ))
          )}
        </DropdownMenuTagList>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
