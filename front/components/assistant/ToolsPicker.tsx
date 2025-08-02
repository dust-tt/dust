import {
  BoltIcon,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  mcpServerViewSortingFn,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
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
}

export function ToolsPicker({
  owner,
  selectedMCPServerViews,
  onSelect,
  onDeselect,
  isLoading = false,
}: ToolsPickerProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { spaces } = useSpaces({ workspaceId: owner.sId });
  const { serverViews: autoServerViews } = useInternalMCPServerViewsFromSpaces(
    owner,
    spaces
  );
  const { serverViews: manualServerViews } = useRemoteMCPServerViewsFromSpaces(
    owner,
    spaces
  );

  const filteredServerViews = useMemo(() => {
    return [...autoServerViews, ...manualServerViews].filter(
      (v) =>
        // Only tools that do not require any configuration can be enabled directly in a conversation.
        getMCPServerRequirements(v).noRequirement &&
        (searchText.length === 0 ||
          getMcpServerViewDisplayName(v)
            .toLowerCase()
            .includes(searchText.toLowerCase()) ||
          getMcpServerViewDescription(v)
            .toLowerCase()
            .includes(searchText.toLowerCase()))
    );
  }, [autoServerViews, manualServerViews, searchText]);

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
          size={"xs"}
          tooltip="Tools"
          disabled={isLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-96"
        align="end"
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
                  //TODO: Implement tool selection
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
          filteredServerViews.sort(mcpServerViewSortingFn).map((v) => {
            const isSelected = !!selectedMCPServerViews.find(
              (sv) => sv.sId === v.sId
            );
            return (
              <DropdownMenuCheckboxItem
                key={`assistant-picker-${v.sId}`}
                icon={() => getAvatar(v.server, "xs")}
                label={getMcpServerViewDisplayName(v)}
                description={getMcpServerViewDescription(v)}
                truncateText
                checked={isSelected}
                onClick={() => {
                  if (isSelected) {
                    onDeselect(v);
                  } else {
                    onSelect(v);
                  }
                  setSearchText("");
                  setIsOpen(false);
                }}
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
