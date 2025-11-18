import {
  BoltIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  LoadingBlock,
  ToolsIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import { CreateMCPServerSheet } from "@app/components/actions/mcp/CreateMCPServerSheet";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  mcpServerViewSortingFn,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import {
  useAvailableMCPServers,
  useMCPServerViewsFromSpaces,
} from "@app/lib/swr/mcp_servers";
import { useSpaces, useSystemSpace } from "@app/lib/swr/spaces";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
} from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types";

function ToolsPickerLoading({ count = 5 }: { count?: number }) {
  return (
    <div className="py-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={`tools-picker-loading-${i}`} className="px-1 py-1">
          <div className="flex items-center gap-3 rounded-md p-2">
            <LoadingBlock className="h-5 w-5 rounded-full dark:bg-muted-foreground-night" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <LoadingBlock className="h-4 w-[80%] dark:bg-muted-foreground-night" />
              <LoadingBlock className="h-3 w-[60%] dark:bg-muted-foreground-night" />
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
  buttonSize?: "xs" | "sm" | "md";
}

export function ToolsPicker({
  owner,
  selectedMCPServerViews,
  onSelect,
  onDeselect,
  isLoading = false,
  disabled = false,
  buttonSize = "xs",
}: ToolsPickerProps) {
  const router = useRouter();
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [setupSheetServer, setSetupSheetServer] =
    useState<MCPServerType | null>(null);

  const { spaces } = useSpaces({ workspaceId: owner.sId, disabled: !isOpen });
  const globalSpaces = useMemo(
    () => spaces.filter((s) => s.kind === "global"),
    [spaces]
  );

  const isAdmin = owner.role === "admin";
  const { systemSpace } = useSystemSpace({
    workspaceId: owner.sId,
    disabled: !isOpen || !isAdmin,
  });

  const {
    serverViews,
    isLoading: isServerViewsLoading,
    mutateServerViews,
  } = useMCPServerViewsFromSpaces(
    owner,
    globalSpaces,
    { disabled: !isOpen } // We don't want to fetch the server views when the picker is closed.
  );

  const selectedMCPServerViewIds = useMemo(
    () => selectedMCPServerViews.map((v) => v.sId),
    [selectedMCPServerViews]
  );

  const { filteredServerViews, filteredServerViewsUnselected } = useMemo(() => {
    const filteredServerViews = serverViews.filter(
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
  }, [serverViews, searchText, selectedMCPServerViewIds]);

  const { availableMCPServers } = useAvailableMCPServers({
    owner,
  });

  // We compare by name, not sId, because names are shared between multiple instances of the same MCP server (sIds are not).
  // We filter by manual availability to show only servers that need install step.
  const uninstalledServers = useMemo(() => {
    if (!availableMCPServers || !serverViews) {
      return [];
    }
    const installedServerNames = new Set(serverViews.map((v) => v.server.name));
    return availableMCPServers.filter(
      (server) =>
        !installedServerNames.has(server.name) &&
        server.availability === "manual"
    );
  }, [availableMCPServers, serverViews]);

  return (
    <>
      <DropdownMenu
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (open) {
            trackEvent({
              area: TRACKING_AREAS.TOOLS,
              object: "tool_picker",
              action: TRACKING_ACTIONS.OPEN,
            });
            setSearchText("");
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            icon={ToolsIcon}
            variant="ghost-secondary"
            size={buttonSize}
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
                      trackEvent({
                        area: TRACKING_AREAS.TOOLS,
                        object: "tool_deselect",
                        action: TRACKING_ACTIONS.SELECT,
                        extra: {
                          tool_id: filteredServerViews[0].sId,
                          tool_name: filteredServerViews[0].server.name,
                        },
                      });
                      onDeselect(filteredServerViews[0]);
                    } else {
                      trackEvent({
                        area: TRACKING_AREAS.TOOLS,
                        object: "tool_select",
                        action: TRACKING_ACTIONS.SELECT,
                        extra: {
                          tool_id: filteredServerViews[0].sId,
                          tool_name: filteredServerViews[0].server.name,
                        },
                      });
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
                      icon={() => getAvatar(v.server)}
                      label={getMcpServerViewDisplayName(v)}
                      description={getMcpServerViewDescription(v)}
                      truncateText
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        trackEvent({
                          area: TRACKING_AREAS.TOOLS,
                          object: "tool_select",
                          action: TRACKING_ACTIONS.SELECT,
                          extra: {
                            tool_id: v.sId,
                            tool_name: v.server.name,
                          },
                        });
                        onSelect(v);
                        setIsOpen(false);
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
          ) : isServerViewsLoading ? (
            <ToolsPickerLoading />
          ) : (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              No results found
            </div>
          )}

          {isAdmin && !isServerViewsLoading && (
            <>
              {uninstalledServers.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel label="Available to install" />
                  {uninstalledServers.map((server) => (
                    <DropdownMenuItem
                      key={`tools-to-install-${server.sId}`}
                      icon={() => getAvatar(server)}
                      label={asDisplayName(server.name)}
                      description={server.description}
                      truncateText
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setSetupSheetServer(server);
                        setIsOpen(false);
                      }}
                    />
                  ))}
                </>
              )}
              {systemSpace && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    icon={() => <Icon visual={ToolsIcon} size="xs" />}
                    label="Manage Tools"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      void router.push(
                        `/w/${owner.sId}/spaces/${systemSpace.sId}/categories/actions`
                      );
                    }}
                  />
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {setupSheetServer && (
        <CreateMCPServerSheet
          owner={owner}
          internalMCPServer={setupSheetServer}
          setMCPServerToShow={async (createdServer) => {
            const updatedData = await mutateServerViews();
            const newServerView = updatedData?.serverViews?.find(
              (v: MCPServerViewType) => v.server.name === createdServer.name
            );
            if (newServerView) {
              trackEvent({
                area: TRACKING_AREAS.TOOLS,
                object: "tool_select",
                action: TRACKING_ACTIONS.SELECT,
                extra: {
                  tool_id: newServerView.sId,
                  tool_name: newServerView.server.name,
                  from_setup: true,
                },
              });
              onSelect(newServerView);
            }

            setSetupSheetServer(null);
          }}
          setIsLoading={() => {}}
          isOpen={!!setupSheetServer}
          setIsOpen={(isOpen) => {
            if (!isOpen) {
              setSetupSheetServer(null);
            }
          }}
        />
      )}
    </>
  );
}
