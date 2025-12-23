import { filterAndSortAgents } from "@app/shared/lib/utils";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/client";
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
  ScrollArea,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

export function AgentPicker({
  agents,
  onItemClick,
  pickerButton,
  size = "md",
  isLoading,
}: {
  owner: LightWorkspaceType;
  agents: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  size?: "xs" | "sm" | "md";
  isLoading?: boolean;
}) {
  const [searchText, setSearchText] = useState("");
  const [searchedAgents, setSearchedAgents] = useState<
    LightAgentConfigurationType[]
  >([]);

  useEffect(() => {
    setSearchedAgents(filterAndSortAgents(agents, searchText));
  }, [searchText, agents]);

  const searchbarRef = (element: HTMLInputElement) => {
    if (element) {
      element.focus();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {pickerButton ? (
          pickerButton
        ) : (
          <Button
            icon={RobotIcon}
            className="text-muted-foreground dark:text-muted-foreground-night"
            variant="ghost"
            size={size}
            tooltip="Pick an agent"
            disabled={isLoading ?? false}
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="xs:w-96 h-96 w-64"
        align="end"
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              ref={searchbarRef}
              placeholder="Search Agents"
              name="input"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchedAgents.length > 0) {
                  onItemClick(searchedAgents[0]);
                  setSearchText("");
                  close();
                }
              }}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        <ScrollArea className="mt-1 flex max-h-[300px] flex-col overflow-y-auto">
          {searchedAgents.map((c) => (
            <DropdownMenuItem
              key={`agent-picker-${c.sId}`}
              icon={() => <Avatar size="xs" visual={c.pictureUrl} />}
              label={c.name}
              onClick={() => {
                onItemClick(c);
                setSearchText("");
              }}
            />
          ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
