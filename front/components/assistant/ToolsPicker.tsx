import {
  BoltIcon,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  mcpServerViewSortingFn,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getMCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useInternalMCPServerViewsFromSpaces,
  useRemoteMCPServerViewsFromSpaces,
} from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import type { WorkspaceType } from "@app/types";

interface ToolsPickerProps {
  owner: WorkspaceType;
  selectedMCPServerViews: MCPServerViewType[];
  onSelect: (serverView: MCPServerViewType) => void;
  onDeselect: (serverView: MCPServerViewType) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function ToolsPicker({
  owner,
  selectedMCPServerViews,
  onSelect,
  onDeselect,
  isLoading = false,
  disabled = false,
}: ToolsPickerProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { spaces } = useSpaces({ workspaceId: owner.sId, disabled: !isOpen });
  const globalSpaces = useMemo(
    () => spaces.filter((s) => s.kind === "global"),
    [spaces]
  );
  const { serverViews: autoServerViews, isLoading: isAutoServerViewsLoading } =
    useInternalMCPServerViewsFromSpaces(
      owner,
      globalSpaces,
      { disabled: !isOpen } // We don't want to fetch the server views when the picker is closed.
    );
  const {
    serverViews: manualServerViews,
    isLoading: isManualServerViewsLoading,
  } = useRemoteMCPServerViewsFromSpaces(
    owner,
    globalSpaces,
    { disabled: !isOpen } // We don't want to fetch the server views when the picker is closed.
  );

  const selectedMCPServerViewIds = useMemo(
    () => selectedMCPServerViews.map((v) => v.sId),
    [selectedMCPServerViews]
  );

  const {
    filteredServerViews,
    filteredServerViewsUnselected,
    filteredServerViewsSelected,
  } = useMemo(() => {
    const filteredServerViews = [
      ...autoServerViews,
      ...manualServerViews,
    ].filter(
      (v) =>
        // Only tools that do not require any configuration can be enabled directly in a conversation.
        getMCPServerToolsConfigurations(v).configurable !== "required" &&
        (searchText.length === 0 ||
          getMcpServerViewDisplayName(v)
            .toLowerCase()
            .includes(searchText.toLowerCase()) ||
          getMcpServerViewDescription(v)
            .toLowerCase()
            .includes(searchText.toLowerCase()))
    );

    return {
      filteredServerViews,
      filteredServerViewsUnselected: filteredServerViews.filter(
        (v) => !selectedMCPServerViewIds.includes(v.sId)
      ),
      filteredServerViewsSelected: filteredServerViews.filter((v) =>
        selectedMCPServerViewIds.includes(v.sId)
      ),
    };
  }, [
    autoServerViews,
    manualServerViews,
    searchText,
    selectedMCPServerViewIds,
  ]);

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
        <Button
          icon={BoltIcon}
          variant="ghost-secondary"
          size="xs"
          tooltip="Tools"
          disabled={disabled || isLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-fit max-h-96 w-96"
        align="start"
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus
              name="search-tools"
              placeholder="Search Tools"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredServerViews.length > 0) {
                  const isSelected = selectedMCPServerViewIds.includes(
                    filteredServerViews[0].sId
                  );
                  if (isSelected) {
                    onDeselect(filteredServerViews[0]);
                  } else {
                    onSelect(filteredServerViews[0]);
                  }
                  setSearchText("");
                  setIsOpen(false);
                }
              }}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {filteredServerViews.length > 0 ? (
          <>
            {filteredServerViewsUnselected
              .sort(mcpServerViewSortingFn)
              .map((v) => {
                return (
                  <DropdownMenuItem
                    key={`tools-picker-${v.sId}`}
                    icon={() => getAvatar(v.server, "xs")}
                    label={getMcpServerViewDisplayName(v)}
                    description={getMcpServerViewDescription(v)}
                    truncateText
                    onClick={(e) => {
                      onSelect(v);
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                  />
                );
              })}
            {filteredServerViewsUnselected.length === 0 && (
              <DropdownMenuItem
                id="tools-picker-no-selected"
                icon={() => <Icon visual={BoltIcon} size="xs" />}
                className="italic"
                label="No more tools to select"
                description="All available tools are already selected"
                disabled
              />
            )}
          </>
        ) : (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            {isAutoServerViewsLoading || isManualServerViewsLoading ? (
              <Spinner size="sm" />
            ) : (
              "No results found"
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
