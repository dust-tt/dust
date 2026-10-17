// Ports of front's input bar pickers:
//   components/assistant/AgentPicker.tsx (+ CreateAgentDropdown)
//   components/assistant/conversation/input_bar/InputBarSpacesPicker.tsx
//   components/assistant/conversation/input_bar/DropdownAnchorTrigger.tsx

import {
  Avatar,
  Brackets,
  Button,
  Check,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DustLogoSquare,
  File02,
  Icon,
  MagicWand02,
  Plus,
  XClose,
} from "@dust-tt/sparkle";
import type React from "react";
import { useMemo, useState } from "react";

import type { ComposerAgent, ComposerSpace } from "../../data/composer";
import { getSpaceIcon } from "../../data/composer";

export function AgentAvatar({
  agent,
  size,
}: {
  agent: ComposerAgent;
  size: "3xs" | "xxs" | "xs" | "sm";
}) {
  if (agent.isDust) {
    return (
      <Avatar size={size} icon={DustLogoSquare} backgroundColor="bg-brand" />
    );
  }
  return (
    <Avatar
      size={size}
      emoji={agent.emoji}
      backgroundColor={agent.backgroundColor}
    />
  );
}

// --- CreateAgentDropdown -----------------------------------------------------

function CreateAgentDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="primary"
          icon={Plus}
          label="Create agent"
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel label="New agent" />
        <DropdownMenuItem icon={File02} label="From scratch" />
        <DropdownMenuItem icon={MagicWand02} label="From template" />
        <DropdownMenuItem icon={Brackets} label="From YAML" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// --- AgentPicker -------------------------------------------------------------

// front/lib/utils.ts filterAndSortAgents: substring match, prefix matches first.
function filterAndSortAgents(agents: ComposerAgent[], searchText: string) {
  const lower = searchText.trim().toLowerCase();
  const filtered = agents.filter((a) => a.name.toLowerCase().includes(lower));
  if (!lower) {
    return filtered;
  }
  return filtered.slice().sort((a, b) => {
    const aPrefix = a.name.toLowerCase().startsWith(lower);
    const bPrefix = b.name.toLowerCase().startsWith(lower);
    if (aPrefix !== bPrefix) {
      return aPrefix ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

interface ComposerAgentPickerProps {
  agents: ComposerAgent[];
  onItemClick: (agent: ComposerAgent) => void;
  onAgentDetailsClick?: (agent: ComposerAgent) => void;
  pickerButton: React.ReactNode;
  side?: "top" | "bottom";
  selectedAgentId?: string | null;
  onDeselect?: () => void;
}

export function ComposerAgentPicker({
  agents,
  onItemClick,
  onAgentDetailsClick,
  pickerButton,
  side,
  selectedAgentId,
  onDeselect,
}: ComposerAgentPickerProps) {
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
        if (open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        {/* Stable anchor across pickerButton swaps: prevents a top-left flash on close. */}
        <div className="inline-flex">{pickerButton}</div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-80"
        side={side}
        align="start"
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus
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
              button={<CreateAgentDropdown />}
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
                icon={() => <AgentAvatar agent={c} size="xs" />}
                label={c.name}
                truncateText
                className={`group py-1 notranslate ${
                  isSelected ? "bg-primary-100" : ""
                }`}
                endComponent={
                  <div className="z-10 flex items-center gap-1">
                    {isSelected && (
                      <>
                        <Icon
                          visual={Check}
                          size="sm"
                          className="group-hover:hidden"
                        />
                        <Icon
                          visual={XClose}
                          size="sm"
                          className="hidden group-hover:block"
                        />
                      </>
                    )}
                    {onAgentDetailsClick ? (
                      <Button
                        icon={DotsHorizontal}
                        variant="outline"
                        size="xmini"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onAgentDetailsClick(c);
                          setIsOpen(false);
                        }}
                      />
                    ) : undefined}
                  </div>
                }
                onClick={() => {
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

// --- DropdownAnchorTrigger ---------------------------------------------------

function DropdownAnchorTrigger({
  anchorRef,
}: {
  anchorRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <DropdownMenuTrigger asChild>
      <div
        ref={(el) => {
          if (el && anchorRef?.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            el.style.position = "fixed";
            el.style.top = `${rect.top}px`;
            el.style.left = `${rect.left}px`;
            el.style.width = `${rect.width}px`;
            el.style.height = `${rect.height}px`;
            el.style.pointerEvents = "none";
            el.style.opacity = "0";
          }
        }}
      />
    </DropdownMenuTrigger>
  );
}

// --- InputBarSpacesPicker (dropdown variant, opened by `/` Spaces) ----------

export function ComposerSpacesPicker({
  anchorRef,
  open,
  onOpenChange,
  selectedSpaceIds,
  onSelectedSpaceIdsChange,
  spaces,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSpaceIds: string[];
  onSelectedSpaceIdsChange: (spaceIds: string[]) => void;
  spaces: ComposerSpace[];
}) {
  const selectedSpaceIdsSet = useMemo(
    () => new Set(selectedSpaceIds),
    [selectedSpaceIds]
  );
  const [searchText, setSearchText] = useState("");
  const filteredSpaces = useMemo(() => {
    const normalizedSearchText = searchText.trim().toLowerCase();
    if (!normalizedSearchText) {
      return spaces;
    }
    return spaces.filter((space) =>
      space.name.toLowerCase().includes(normalizedSearchText)
    );
  }, [searchText, spaces]);

  const handleSpaceCheckedChange = (spaceId: string, checked: boolean) => {
    if (checked) {
      onSelectedSpaceIdsChange(
        selectedSpaceIdsSet.has(spaceId)
          ? selectedSpaceIds
          : [...selectedSpaceIds, spaceId]
      );
      return;
    }
    onSelectedSpaceIdsChange(selectedSpaceIds.filter((id) => id !== spaceId));
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setSearchText("");
        }
      }}
    >
      <DropdownAnchorTrigger anchorRef={anchorRef} />
      <DropdownMenuContent
        className="w-80 max-w-[calc(100vw-1rem)]"
        collisionPadding={8}
        align="end"
        onInteractOutside={() => onOpenChange(false)}
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus
              name="search-spaces"
              placeholder="Search Spaces"
              value={searchText}
              onChange={setSearchText}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        <DropdownMenuCheckboxItem label="Agent's Spaces" checked disabled />
        <DropdownMenuSeparator />
        <DropdownMenuLabel label="Additional Spaces" />
        {spaces.length === 0 ? (
          <DropdownMenuItem label="No Spaces available" disabled />
        ) : filteredSpaces.length === 0 ? (
          <DropdownMenuItem label="No matching Spaces" disabled />
        ) : (
          <div>
            {filteredSpaces.map((space) => {
              const checked = selectedSpaceIdsSet.has(space.sId);
              return (
                <DropdownMenuCheckboxItem
                  key={space.sId}
                  label={space.name}
                  icon={getSpaceIcon(space)}
                  checked={checked}
                  onCheckedChange={(nextChecked) =>
                    handleSpaceCheckedChange(space.sId, nextChecked === true)
                  }
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                />
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
