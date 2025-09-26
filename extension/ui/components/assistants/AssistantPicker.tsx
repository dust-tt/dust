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

export function AssistantPicker({
  assistants,
  onItemClick,
  pickerButton,
  size = "md",
  isLoading,
}: {
  owner: LightWorkspaceType;
  assistants: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  size?: "xs" | "sm" | "md";
  isLoading?: boolean;
}) {
  const [searchText, setSearchText] = useState("");
  const [searchedAssistants, setSearchedAssistants] = useState<
    LightAgentConfigurationType[]
  >([]);

  useEffect(() => {
    setSearchedAssistants(filterAndSortAgents(assistants, searchText));
  }, [searchText, assistants]);

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
        className="h-96 w-64 xs:w-96"
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
                if (e.key === "Enter" && searchedAssistants.length > 0) {
                  onItemClick(searchedAssistants[0]);
                  setSearchText("");
                  close();
                }
              }}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        <ScrollArea className="flex flex-col mt-1 max-h-[300px] overflow-y-auto">
          {searchedAssistants.map((c) => (
            <DropdownMenuItem
              key={`assistant-picker-${c.sId}`}
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
