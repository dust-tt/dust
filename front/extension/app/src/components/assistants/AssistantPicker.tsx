import { filterAndSortAgents } from "@app/extension/app/src/lib/utils";
import {
  Button,
  Item,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  RobotIcon,
  ScrollArea,
  Searchbar,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useEffect, useState } from "react";

export function AssistantPicker({
  assistants,
  onItemClick,
  pickerButton,
  size = "md",
}: {
  owner: WorkspaceType;
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
    <PopoverRoot>
      <PopoverTrigger>
        <>
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
        </>
      </PopoverTrigger>
      <PopoverContent className="mr-2 p-2">
        <Searchbar
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
        <ScrollArea className="mt-2 h-[300px]">
          {searchedAssistants.map((c) => (
            <div
              key={`assistant-picker-container-${c.sId}`}
              className="flex flex-row items-center justify-between px-2"
            >
              <Item.Avatar
                key={`assistant-picker-${c.sId}`}
                label={c.name}
                visual={c.pictureUrl}
                hasAction={false}
                onClick={() => {
                  onItemClick(c);
                  setSearchText("");
                }}
                className="truncate"
              />
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </PopoverRoot>
  );
}
