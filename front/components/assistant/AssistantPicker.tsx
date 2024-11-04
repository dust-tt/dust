import {
  Avatar,
  Button,
  NewDropdownMenu,
  NewDropdownMenuContent,
  NewDropdownMenuItem,
  NewDropdownMenuSearchbar,
  NewDropdownMenuSeparator,
  NewDropdownMenuTrigger,
  PlusIcon,
  RobotIcon,
  ScrollArea,
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
    <NewDropdownMenu>
      <NewDropdownMenuTrigger asChild>
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
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent className="min-w-[300px]">
        <NewDropdownMenuSearchbar
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
        <NewDropdownMenuSeparator className="mt-2" />
        <ScrollArea className="mt-1 h-[300px]">
          {searchedAssistants.map((c) => (
            <NewDropdownMenuItem
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
        {showFooterButtons && (
          <>
            <NewDropdownMenuSeparator />
            <div className="flex justify-end">
              <Button
                label="Create"
                size="xs"
                variant="primary"
                icon={PlusIcon}
                className="mr-2"
                href={`/w/${owner.sId}/builder/assistants/create?flow=personal_assistants`}
              />
            </div>
          </>
        )}
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}
