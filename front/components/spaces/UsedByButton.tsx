import type { AgentsUsageType } from "@app/types/data_source";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  RobotIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

export const UsedByButton = ({
  usage,
  onItemClick,
}: {
  usage: AgentsUsageType | null;
  onItemClick: (assistantSid: string) => void;
}) => {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredAgents = useMemo(() => {
    if (!usage) {
      return [];
    }
    const q = searchText.toLowerCase();
    return q.length === 0
      ? usage.agents
      : usage.agents.filter((a) => a.name.toLowerCase().includes(q));
  }, [usage, searchText]);

  if (!usage || usage.count === 0) {
    return (
      <Button
        icon={RobotIcon}
        variant="ghost-secondary"
        isSelect={false}
        size="xs"
        label="0"
        disabled
      />
    );
  }

  return (
    // 1. modal={false} to make the dropdown menu non-modal and avoid a timing issue when we open the Agent side-panel modal.
    <DropdownMenu
      modal={false}
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          icon={RobotIcon}
          variant="ghost-secondary"
          isSelect={true}
          size="xs"
          label={`${usage.count}`}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            // 2. Avoid propagating the click to the parent element.
            e.stopPropagation();
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-72"
        align="end"
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus
              name="search-used-by-agents"
              placeholder="Search agents"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredAgents.length > 0) {
                  onItemClick(filteredAgents[0].sId);
                  setSearchText("");
                  setIsOpen(false);
                }
              }}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {filteredAgents.length > 0 ? (
          filteredAgents.map((agent) => (
            <DropdownMenuItem
              key={`assistant-picker-${agent.sId}`}
              label={agent.name}
              truncateText
              onClick={(e) => {
                e.stopPropagation();
                onItemClick(agent.sId);
                setIsOpen(false);
              }}
            />
          ))
        ) : (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            No agents found
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
