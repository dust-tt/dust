import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PlusIcon,
  RobotIcon,
  ScrollArea,
  ScrollBar,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { filterAndSortAgents } from "@app/lib/utils";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";

interface AssistantPickerProps {
  owner: WorkspaceType;
  assistants: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  showMoreDetailsButtons?: boolean;
  showFooterButtons?: boolean;
  size?: "xs" | "sm" | "md";
}

export function AssistantPicker({
  owner,
  assistants,
  onItemClick,
  pickerButton,
  showFooterButtons = true,
  size = "md",
}: AssistantPickerProps) {
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
            variant="ghost-secondary"
            isSelect
            size={size}
            tooltip="Pick an agent"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[300px]">
        <DropdownMenuSearchbar
          ref={searchbarRef}
          placeholder="Search"
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
        <ScrollArea className="flex max-h-[300px] flex-col" hideScrollBar>
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
          <ScrollBar className="py-0" />
        </ScrollArea>
        <DropdownMenuSeparator />
        {showFooterButtons && (
          <div className="flex justify-end p-1">
            <Button
              label="Create"
              size="xs"
              variant="primary"
              icon={PlusIcon}
              href={`/w/${owner.sId}/builder/assistants/create?flow=personal_assistants`}
            />
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
