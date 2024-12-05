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
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useEffect, useState } from "react";

import { filterAndSortAgents } from "@app/lib/utils";

export function AssistantPicker({
  owner,
  assistants,
  onItemClick,
  pickerButton,
  showFooterButtons = true,
  size = "md",
}: {
  owner: WorkspaceType;
  assistants: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  showMoreDetailsButtons?: boolean;
  showFooterButtons?: boolean;
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
            variant="ghost-secondary"
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
        <ScrollArea
          className="flex max-h-[300px] flex-col overflow-y-auto"
          hideScrollBar
        >
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
