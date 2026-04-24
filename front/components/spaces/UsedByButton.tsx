import type { AgentsUsageType } from "@app/types/data_source";
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  RobotIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

export const UsedByButton = ({
  usage,
  onItemClick,
}: {
  usage: AgentsUsageType | null;
  onItemClick: (assistantSid: string) => void;
}) => {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

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

  const query = searchText.toLowerCase();
  const filteredAgents =
    query.length === 0
      ? usage.agents
      : usage.agents.filter((a) => a.name.toLowerCase().includes(query));

  return (
    <DropdownMenu
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
          isSelect
          size="xs"
          label={`${usage.count}`}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-72"
        align="end"
        onClick={(e) => e.stopPropagation()}
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
              icon={() => <Avatar size="xs" visual={agent.pictureUrl} />}
              label={agent.name}
              truncateText
              className="py-1"
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
