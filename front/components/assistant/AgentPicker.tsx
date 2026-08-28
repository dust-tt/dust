import { CreateDropdown } from "@app/components/assistant/CreateDropdown";
import { useClientType } from "@app/lib/context/clientType";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { filterAndSortAgents } from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  Check,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Robot,
  X,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface AgentPickerProps {
  owner: LightWorkspaceType;
  agents: LightAgentConfigurationType[];
  onItemClick: (agent: LightAgentConfigurationType) => void;
  onAgentDetailsClick?: (agentId: string) => void;
  pickerButton?: React.ReactNode;
  showDropdownArrow?: boolean;
  showFooterButtons?: boolean;
  side?: "top" | "bottom";
  size?: "xs" | "sm" | "md";
  isLoading?: boolean;
  disabled?: boolean;
  mountPortal?: boolean;
  onOpenChange?: (open: boolean) => void;
  selectedAgentId?: string | null;
  onDeselect?: () => void;
}

export function AgentPicker({
  owner,
  agents,
  onItemClick,
  onAgentDetailsClick,
  pickerButton,
  showDropdownArrow = true,
  showFooterButtons = true,
  side,
  size = "md",
  isLoading = false,
  disabled = false,
  onOpenChange,
  selectedAgentId,
  onDeselect,
}: AgentPickerProps) {
  const clientType = useClientType();
  const isMobile = useIsMobile();
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const searched = filterAndSortAgents(agents, searchText);
  const selected = searched.find((a) => a.sId === selectedAgentId);
  const searchedAgents = selected
    ? [selected, ...searched.filter((a) => a.sId !== selectedAgentId)]
    : searched;

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        onOpenChange?.(open);
        if (open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        {/* Stable anchor across pickerButton swaps: prevents a top-left flash on close. */}
        <div className="inline-flex">
          {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
          {pickerButton ? (
            pickerButton
          ) : (
            <Button
              icon={Robot}
              variant="ghost-secondary"
              isSelect={showDropdownArrow}
              size={size}
              tooltip="Pick an agent"
              disabled={disabled || isLoading}
            />
          )}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-80"
        side={side}
        align="start"
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus={!isMobile}
              name="search-agents"
              placeholder="Search Agents"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchedAgents.length > 0) {
                  onItemClick(searchedAgents[0]);
                  setSearchText("");
                  setIsOpen(false);
                }
              }}
              button={
                showFooterButtons && (
                  <CreateDropdown owner={owner} dataGtmLocation="homepage" />
                )
              }
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {searchedAgents.length > 0 ? (
          searchedAgents.map((c) => {
            const isSelected = c.sId === selectedAgentId;
            return (
              <DropdownMenuItem
                key={`agent-picker-${c.sId}`}
                icon={() => <Avatar size="xs" visual={c.pictureUrl} />}
                label={c.name}
                truncateText
                className={`group py-1 notranslate ${
                  isSelected ? "bg-primary-100" : ""
                }`}
                endComponent={
                  <div className="flex items-center gap-1">
                    {isSelected && (
                      // Show a tick by default; on hover swap it for an X to
                      // signal that clicking will deselect the agent.
                      <>
                        <Icon
                          visual={Check}
                          size="sm"
                          className="group-hover:hidden"
                        />
                        <Icon
                          visual={X}
                          size="sm"
                          className="hidden group-hover:block"
                        />
                      </>
                    )}
                    {onAgentDetailsClick && clientType !== "extension" ? (
                      <Button
                        icon={DotsHorizontal}
                        variant="outline"
                        size="xmini"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onAgentDetailsClick(c.sId);
                          setIsOpen(false);
                        }}
                      />
                    ) : undefined}
                  </div>
                }
                onClick={() => {
                  // Clicking the selected agent deselects it; keep the picker
                  // open so a different agent can be chosen right away.
                  if (isSelected) {
                    onDeselect?.();
                    return;
                  }
                  onItemClick(c);
                  setSearchText("");
                  setIsOpen(false);
                }}
                onSelect={isSelected ? (e) => e.preventDefault() : undefined}
              />
            );
          })
        ) : (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            No results found
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
