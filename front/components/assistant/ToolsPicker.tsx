import {
  BoltIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  LoadingBlock,
  ToolsIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  mcpServerViewSortingFn,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useInternalMCPServerViewsFromSpaces,
  useRemoteMCPServerViewsFromSpaces,
} from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import type { WorkspaceType } from "@app/types";

function ToolsPickerLoading({ count = 5 }: { count?: number }) {
  return (
    <div className="py-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={`tools-picker-loading-${i}`} className="px-1 py-1">
          <div className="flex items-center gap-3 rounded-md p-2">
            <LoadingBlock className="h-5 w-5 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <LoadingBlock className="h-4 w-[80%]" />
              <LoadingBlock className="h-3 w-[60%]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

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

  const { filteredServerViews, filteredServerViewsUnselected } = useMemo(() => {
    const filteredServerViews = [
      ...autoServerViews,
      ...manualServerViews,
    ].filter(
      (v) =>
        isJITMCPServerView(v) &&
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
          icon={ToolsIcon}
          variant="ghost-secondary"
          size="xs"
          tooltip="Tools"
          disabled={disabled || isLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="max-h-96 w-96"
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
        ) : isAutoServerViewsLoading || isManualServerViewsLoading ? (
          <ToolsPickerLoading />
        ) : (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            No results found
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
