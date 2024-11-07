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
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { filterAndSortAgents } from "@extension/lib/utils";
import { useEffect, useState } from "react";

export function AssistantPicker({
  assistants,
  onItemClick,
  pickerButton,
  size = "md",
}: {
  owner: LightWorkspaceType;
  assistants: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  size?: "xs" | "sm" | "md";
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
            variant="ghost"
            isSelect
            size={size}
            tooltip="Pick an assistant"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[300px]">
        <DropdownMenuSearchbar
          ref={searchbarRef}
          placeholder="Search"
          name="input"
          size="xs"
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
        <DropdownMenuSeparator className="mt-2" />
        <ScrollArea className="mt-1 h-[300px]">
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
