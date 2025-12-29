import {
  BoltIcon,
  Button,
  Chip,
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
import { useEffect, useMemo, useState } from "react";

import { CreateMCPServerDialog } from "@app/components/actions/mcp/CreateMCPServerSheet";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  mcpServersSortingFn,
  mcpServerViewSortingFn,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { getDefaultRemoteMCPServerByName } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import {
  useAvailableMCPServers,
  useMCPServerViewsFromSpaces,
} from "@app/lib/swr/mcp_servers";
import { useSkills } from "@app/lib/swr/skill_configurations";
import { useSpaces } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
} from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

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

interface CapabilityItemProps {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string | null;
  onClick?: () => void;
  keyPrefix: string;
  endComponent?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

function CapabilityItem({
  id,
  icon,
  label,
  description,
  onClick,
  keyPrefix,
  endComponent,
  disabled,
  className,
}: CapabilityItemProps) {
  return (
    <DropdownMenuItem
      key={`${keyPrefix}-${id}`}
      id={`${keyPrefix}-${id}`}
      icon={icon}
      label={label}
      description={description ?? undefined}
      truncateText
      endComponent={endComponent}
      disabled={disabled}
      className={className}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              e.preventDefault();
              onClick();
            }
          : undefined
      }
    />
  );
}

interface ToolsPickerProps {
  owner: WorkspaceType;
  selectedMCPServerViews: MCPServerViewType[];
  onSelect: (serverView: MCPServerViewType) => void;
  onDeselect: (serverView: MCPServerViewType) => void;
  selectedSkills: SkillType[];
  onSkillSelect: (skill: SkillType) => void;
  onSkillDeselect: (skill: SkillType) => void;
  isLoading?: boolean;
  disabled?: boolean;
  buttonSize?: "xs" | "sm" | "md";
}

export function ToolsPicker({
  owner,
  selectedMCPServerViews,
  onSelect,
  onDeselect,
  selectedSkills,
  onSkillSelect,
  isLoading = false,
  disabled = false,
  buttonSize = "xs",
}: ToolsPickerProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [setupSheetServer, setSetupSheetServer] =
    useState<MCPServerType | null>(null);
  const [setupSheetRemoteServerConfig, setSetupSheetRemoteServerConfig] =
    useState<DefaultRemoteMCPServerConfig | null>(null);
  const [isSettingUpServer, setIsSettingUpServer] = useState(false);
  const [pendingServerToAdd, setPendingServerToAdd] =
    useState<MCPServerType | null>(null);

  const shouldFetchToolsData =
    isOpen || isSettingUpServer || !!pendingServerToAdd;

  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const hasSkillsFeature = hasFeature("skills");

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    disabled: !shouldFetchToolsData,
  });
  const globalSpaces = useMemo(
    () => spaces.filter((s) => s.kind === "global"),
    [spaces]
  );

  const isAdmin = owner.role === "admin";

  const {
    serverViews,
    isLoading: isServerViewsLoading,
    mutateServerViews,
  } = useMCPServerViewsFromSpaces(owner, globalSpaces, {
    disabled: !shouldFetchToolsData,
  });

  const selectedMCPServerViewIds = useMemo(
    () => selectedMCPServerViews.map((v) => v.sId),
    [selectedMCPServerViews]
  );

  // Fallback: add server to conversation when it appears in serverViews.
  useEffect(() => {
    if (pendingServerToAdd) {
      const newServerView = serverViews.find(
        (v) => v.server.name === pendingServerToAdd.name
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
        setPendingServerToAdd(null);
        setIsSettingUpServer(false);
      }
    }
  }, [serverViews, pendingServerToAdd, onSelect]);

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
      filteredServerViews: filteredServerViews,
      filteredServerViewsUnselected: filteredServerViews
        .filter((v) => !selectedMCPServerViewIds.includes(v.sId))
        .sort(mcpServerViewSortingFn),
    };
  }, [serverViews, searchText, selectedMCPServerViewIds]);

  const { availableMCPServers, isAvailableMCPServersLoading } =
    useAvailableMCPServers({
      owner,
      disabled: !shouldFetchToolsData,
    });

  const { skills, isSkillsLoading } = useSkills({
    owner,
    status: "active",
    spaces: globalSpaces,
    disabled: !shouldFetchToolsData || !hasSkillsFeature,
  });

  const isDataReady =
    !isServerViewsLoading &&
    !isAvailableMCPServersLoading &&
    (!hasSkillsFeature || !isSkillsLoading);

  const filteredSkillsUnselected = useMemo(() => {
    const selectedSkillIds = new Set(selectedSkills.map((s) => s.sId));

    return skills
      .filter((skill) => !selectedSkillIds.has(skill.sId))
      .filter((skill) => {
        if (searchText.trim().length === 0) {
          return true;
        }
        const query = searchText.toLowerCase();
        return (
          skill.name.toLowerCase().includes(query) ||
          (skill.userFacingDescription &&
            skill.userFacingDescription.toLowerCase().includes(query))
        );
      });
  }, [skills, selectedSkills, searchText]);

  // - We compare by name, not sId, because names are shared between multiple instances of the same MCP server (sIds are not).
  // - We filter by manual availability to show only servers that need install step, and by search text if present.
  // - We don't compute uninstalled servers until BOTH data sources have loaded to prevent flicker.
  const filteredUninstalledServers = useMemo(() => {
    if (!isAdmin || !isDataReady || !shouldFetchToolsData) {
      return [];
    }

    const installedServerNames = new Set(serverViews.map((v) => v.server.name));
    const uninstalled = availableMCPServers.filter(
      (server) =>
        !installedServerNames.has(server.name) &&
        server.availability === "manual"
    );

    if (searchText.length === 0) {
      return uninstalled;
    }

    return uninstalled
      .filter(
        (server) =>
          asDisplayName(server.name)
            .toLowerCase()
            .includes(searchText.toLowerCase()) ||
          server.description.toLowerCase().includes(searchText.toLowerCase())
      )
      .sort((a, b) => mcpServersSortingFn({ mcpServer: a }, { mcpServer: b }));
  }, [
    isAdmin,
    isDataReady,
    shouldFetchToolsData,
    serverViews,
    availableMCPServers,
    searchText,
  ]);

  const shouldShowSetupSheet = useMemo(() => {
    return !!setupSheetServer || !!setupSheetRemoteServerConfig;
  }, [setupSheetServer, setupSheetRemoteServerConfig]);

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
                placeholder="Search capabilities"
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
          {!isDataReady && <ToolsPickerLoading />}

          {isDataReady &&
            hasSkillsFeature &&
            filteredSkillsUnselected.length > 0 && (
              <>
                <div className="text-element-700 px-4 py-2 text-xs font-semibold">
                  Skills
                </div>
                {filteredSkillsUnselected.map((skill) => (
                  <CapabilityItem
                    key={`skills-picker-${skill.sId}`}
                    id={skill.sId}
                    icon={getSkillAvatarIcon(skill.icon)}
                    label={skill.name}
                    description={skill.userFacingDescription}
                    keyPrefix="skills-picker"
                    onClick={() => {
                      trackEvent({
                        area: TRACKING_AREAS.TOOLS,
                        object: "skill_select",
                        action: TRACKING_ACTIONS.SELECT,
                        extra: {
                          skill_id: skill.sId,
                          skill_name: skill.name,
                        },
                      });
                      onSkillSelect(skill);
                      setIsOpen(false);
                    }}
                  />
                ))}
              </>
            )}

          {isDataReady && filteredServerViews.length > 0 && (
            <>
              <div className="text-element-700 px-4 py-2 text-xs font-semibold">
                Tools
              </div>
              {filteredServerViewsUnselected.map((v) => (
                <CapabilityItem
                  key={`tools-picker-${v.sId}`}
                  id={v.sId}
                  icon={() => getAvatar(v.server)}
                  label={getMcpServerViewDisplayName(v)}
                  description={getMcpServerViewDescription(v)}
                  keyPrefix="tools-picker"
                  onClick={() => {
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
              ))}
            </>
          )}

          {isDataReady &&
            filteredUninstalledServers.length > 0 &&
            filteredUninstalledServers.map((server) => (
              <CapabilityItem
                key={`tools-to-install-${server.sId}`}
                id={server.sId}
                icon={() => getAvatar(server)}
                label={asDisplayName(server.name)}
                description={server.description}
                keyPrefix="tools-to-install"
                endComponent={
                  <Chip size="xs" color="golden" label="Configure" />
                }
                onClick={() => {
                  const remoteMcpServerConfig = getDefaultRemoteMCPServerByName(
                    server.name
                  );

                  if (remoteMcpServerConfig) {
                    // Remote servers always use the remote flow, even if they have OAuth.
                    setSetupSheetServer(null);
                    setSetupSheetRemoteServerConfig(remoteMcpServerConfig);
                  } else {
                    // Internal servers (with or without OAuth)
                    setSetupSheetServer(server);
                    setSetupSheetRemoteServerConfig(null);
                  }

                  setIsSettingUpServer(true);
                  setIsOpen(false);
                }}
              />
            ))}

          {isDataReady &&
            filteredSkillsUnselected.length === 0 &&
            filteredServerViewsUnselected.length === 0 &&
            filteredUninstalledServers.length === 0 && (
              <CapabilityItem
                id="no-selected"
                icon={() => <Icon visual={BoltIcon} size="xs" />}
                label={
                  searchText.length > 0
                    ? "No result"
                    : hasSkillsFeature
                      ? "No more skills or tools to select"
                      : "No more tools to select"
                }
                description={
                  searchText.length > 0
                    ? hasSkillsFeature
                      ? "No skills or tools found matching your search."
                      : "No tools found matching your search."
                    : hasSkillsFeature
                      ? "All available skills and tools are already selected."
                      : "All available tools are already selected."
                }
                keyPrefix="tools-picker"
                disabled
                className="italic"
              />
            )}
        </DropdownMenuContent>
      </DropdownMenu>

      {shouldShowSetupSheet && (
        <CreateMCPServerDialog
          owner={owner}
          internalMCPServer={setupSheetServer ?? undefined}
          defaultServerConfig={setupSheetRemoteServerConfig ?? undefined}
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
              setIsSettingUpServer(false);
            } else {
              setPendingServerToAdd(createdServer);
            }

            setSetupSheetServer(null);
            setSetupSheetRemoteServerConfig(null);
          }}
          setIsLoading={() => {}}
          isOpen={shouldShowSetupSheet}
          setIsOpen={(isOpen) => {
            if (!isOpen) {
              setSetupSheetServer(null);
              setSetupSheetRemoteServerConfig(null);
              setPendingServerToAdd(null);
              setIsSettingUpServer(false);
            }
          }}
        />
      )}
    </>
  );
}
