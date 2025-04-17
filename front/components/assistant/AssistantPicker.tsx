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
import { useState } from "react";

import { filterAndSortAgents } from "@app/lib/utils";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";

interface AssistantPickerProps {
  owner: WorkspaceType;
  assistants: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  showFooterButtons?: boolean;
  size?: "xs" | "sm" | "md";
  isLoading?: boolean;
}

export function AssistantPicker({
  owner,
  assistants,
  onItemClick,
  pickerButton,
  showFooterButtons = true,
  size = "md",
  isLoading = false,
}: AssistantPickerProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const searchedAssistants = filterAndSortAgents(assistants, searchText);

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
        {pickerButton ? (
          pickerButton
        ) : (
          <Button
            icon={RobotIcon}
            variant="ghost-secondary"
            isSelect
            size={size}
            tooltip="Pick an agent"
            disabled={isLoading}
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-96" align="end">
        <DropdownMenuSearchbar
          autoFocus
          name="search-assistants"
          placeholder="Search Agents"
          value={searchText}
          onChange={setSearchText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchedAssistants.length > 0) {
              onItemClick(searchedAssistants[0]);
              setSearchText("");
              setIsOpen(false);
            }
          }}
          button={
            showFooterButtons && (
              <Button
                label="Create"
                icon={PlusIcon}
                href={`/w/${owner.sId}/builder/assistants/create?flow=personal_assistants`}
              />
            )
          }
        />
        <DropdownMenuSeparator />
        <ScrollArea className="h-96">
          {searchedAssistants.length > 0 ? (
            searchedAssistants.map((c) => (
              <DropdownMenuItem
                key={`assistant-picker-${c.sId}`}
                icon={() => <Avatar size="xs" visual={c.pictureUrl} />}
                label={c.name}
                truncateText
                onClick={() => {
                  onItemClick(c);
                  setSearchText("");
                  setIsOpen(false);
                }}
              />
            ))
          ) : (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              No results found
            </div>
          )}
          <ScrollBar className="py-0" />
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
