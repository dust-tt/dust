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

import { CreateAgentButton } from "@app/components/assistant/CreateAgentButton";
import { filterAndSortAgents } from "@app/lib/utils";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";

interface AssistantPickerProps {
  owner: WorkspaceType;
  assistants: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  showDropdownArrow?: boolean;
  showFooterButtons?: boolean;
  size?: "xs" | "sm" | "md";
  isLoading?: boolean;
  disabled?: boolean;
  mountPortal?: boolean;
}

export function AssistantPicker({
  owner,
  assistants,
  onItemClick,
  pickerButton,
  showDropdownArrow = true,
  showFooterButtons = true,
  size = "md",
  isLoading = false,
  disabled = false,
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
            isSelect={showDropdownArrow}
            size={size}
            tooltip="Pick an agent"
            disabled={disabled || isLoading}
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-96"
        align="start"
        dropdownHeaders={
          <>
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
                  <CreateAgentButton owner={owner} dataGtmLocation="homepage" />
                )
              }
            />
            <DropdownMenuSeparator />
          </>
        }
      >
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
