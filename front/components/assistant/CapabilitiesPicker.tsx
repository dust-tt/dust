import {
  BoltIcon,
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
  Icon,
  LoadingBlock,
  MoreIcon,
  ToolsIcon,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { CreateMCPServerDialog } from "@app/components/actions/mcp/create/CreateMCPServerDialog";
import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  mcpServersSortingFn,
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
import {
  useSkills,
  useSkillWithRelations,
} from "@app/lib/swr/skill_configurations";
import { useSpaces } from "@app/lib/swr/spaces";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
} from "@app/lib/tracking";
import type { UserType, WorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types";
import type {
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

type MergedCapabilityItem =
  | { kind: "skill"; skill: SkillType; sortName: string }
  | { kind: "tool"; serverView: MCPServerViewType; sortName: string };

function CapabilitiesPickerLoading({ count = 5 }: { count?: number }) {
  return (
    <div className="py-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={`capabilities-picker-loading-${i}`} className="px-1 py-1">
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

interface SkillMenuItemProps {
  skill: SkillType;
  onSelect: (skill: SkillType) => void;
  onDetails: (skillSId: string) => void;
  closeDropdown: () => void;
}

function SkillMenuItem({
  skill,
  onSelect,
  onDetails,
  closeDropdown,
}: SkillMenuItemProps) {
  const description = skill.userFacingDescription;
  const key = `skills-picker-${skill.sId}`;

  const menuItem = (
    <DropdownMenuItem
      key={key}
      id={key}
      icon={getSkillAvatarIcon(skill.icon)}
      label={skill.name}
      truncateText
      className="group py-1"
      endComponent={
        <Button
          icon={MoreIcon}
          variant="outline"
          size="mini"
          className="opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDetails(skill.sId);
            closeDropdown();
          }}
        />
      }
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        trackEvent({
          area: TRACKING_AREAS.TOOLS,
          object: "skill_select",
          action: TRACKING_ACTIONS.SELECT,
          extra: {
            skill_id: skill.sId,
            skill_name: skill.name,
          },
        });
        onSelect(skill);
        closeDropdown();
      }}
    />
  );

  if (description) {
    return (
      <DropdownTooltipTrigger
        key={key}
        description={description}
        side="right"
        sideOffset={8}
      >
        {menuItem}
      </DropdownTooltipTrigger>
    );
  }

  return menuItem;
}

interface ToolMenuItemProps {
  serverView: MCPServerViewType;
  onSelect: (serverView: MCPServerViewType) => void;
  onDetails: (serverView: MCPServerViewType) => void;
  closeDropdown: () => void;
}

function ToolMenuItem({
  serverView,
  onSelect,
  onDetails,
  closeDropdown,
}: ToolMenuItemProps) {
  const description = getMcpServerViewDescription(serverView);
  const key = `capabilities-picker-${serverView.sId}`;

  const menuItem = (
    <DropdownMenuItem
      key={key}
      id={key}
      icon={() => getAvatar(serverView.server)}
      label={getMcpServerViewDisplayName(serverView)}
      truncateText
      className="group py-1"
      endComponent={
        <Button
          icon={MoreIcon}
          variant="outline"
          size="mini"
          className="opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDetails(serverView);
            closeDropdown();
          }}
        />
      }
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        trackEvent({
          area: TRACKING_AREAS.TOOLS,
          object: "tool_select",
          action: TRACKING_ACTIONS.SELECT,
          extra: {
            tool_id: serverView.sId,
            tool_name: serverView.server.name,
          },
        });
        onSelect(serverView);
        closeDropdown();
      }}
    />
  );

  if (description) {
    return (
      <DropdownTooltipTrigger
        key={key}
        description={description}
        side="right"
        sideOffset={8}
      >
        {menuItem}
      </DropdownTooltipTrigger>
    );
  }

  return menuItem;
}

interface UninstalledToolMenuItemProps {
  server: MCPServerType;
  onSetup: (server: MCPServerType) => void;
}

function UninstalledToolMenuItem({
  server,
  onSetup,
}: UninstalledToolMenuItemProps) {
  return (
    <DropdownMenuItem
      key={`tools-to-install-${server.sId}`}
      id={`tools-to-install-${server.sId}`}
      icon={() => getAvatar(server)}
      label={asDisplayName(server.name)}
      truncateText
      endComponent={<Chip size="xs" color="golden" label="Configure" />}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onSetup(server);
      }}
    />
  );
}

interface CapabilitiesPickerProps {
  owner: WorkspaceType;
  user: UserType | null;
  selectedMCPServerViews: MCPServerViewType[];
  onSelect: (serverView: MCPServerViewType) => void;
  selectedSkills: SkillType[];
  onSkillSelect: (skill: SkillType) => void;
  isLoading?: boolean;
  disabled?: boolean;
  buttonSize?: "xs" | "sm" | "md";
}

export function CapabilitiesPicker({
  owner,
  user,
  selectedMCPServerViews,
  onSelect,
  selectedSkills,
  onSkillSelect,
  isLoading = false,
  disabled = false,
  buttonSize = "xs",
}: CapabilitiesPickerProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [setupSheetServer, setSetupSheetServer] =
    useState<MCPServerType | null>(null);
  const [setupSheetRemoteServerConfig, setSetupSheetRemoteServerConfig] =
    useState<DefaultRemoteMCPServerConfig | null>(null);
  const [isSettingUpServer, setIsSettingUpServer] = useState(false);
  const [pendingServerToAdd, setPendingServerToAdd] =
    useState<MCPServerType | null>(null);

  // Detail sheet state
  const [selectedSkillForDetails, setSelectedSkillForDetails] =
    useState<SkillWithRelationsType | null>(null);
  const [selectedServerViewForDetails, setSelectedServerViewForDetails] =
    useState<MCPServerViewType | null>(null);

  const { fetchSkillWithRelations } = useSkillWithRelations(owner, {
    onSuccess: ({ skill }) => setSelectedSkillForDetails(skill),
  });

  const shouldFetchToolsData =
    isOpen || isClosing || isSettingUpServer || !!pendingServerToAdd;

  const { spaces: globalSpaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
    disabled: !shouldFetchToolsData,
  });

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

  const filteredServerViewsUnselected = useMemo(() => {
    return serverViews
      .filter(
        (v) =>
          isJITMCPServerView(v) &&
          (searchText.length === 0 ||
            getMcpServerViewDisplayName(v)
              .toLowerCase()
              .includes(searchText.toLowerCase()) ||
            getMcpServerViewDescription(v)
              .toLowerCase()
              .includes(searchText.toLowerCase()))
      )
      .filter((v) => !selectedMCPServerViewIds.includes(v.sId));
  }, [serverViews, searchText, selectedMCPServerViewIds]);

  const { availableMCPServers, isAvailableMCPServersLoading } =
    useAvailableMCPServers({
      owner,
      disabled: !shouldFetchToolsData,
    });

  const { skills, isSkillsLoading } = useSkills({
    owner,
    status: "active",
    globalSpaceOnly: true,
    disabled: !shouldFetchToolsData,
  });

  const isSkillsDataReady = !isSkillsLoading;
  const isToolsDataReady =
    !isServerViewsLoading && !isAvailableMCPServersLoading;

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

  const mergedItems = useMemo(() => {
    const items: MergedCapabilityItem[] = [
      ...filteredSkillsUnselected.map(
        (skill): MergedCapabilityItem => ({
          kind: "skill",
          skill,
          sortName: skill.name.toLowerCase(),
        })
      ),
      ...filteredServerViewsUnselected.map(
        (serverView): MergedCapabilityItem => ({
          kind: "tool",
          serverView,
          sortName: getMcpServerViewDisplayName(serverView).toLowerCase(),
        })
      ),
    ];
    return [...items].sort((a, b) => a.sortName.localeCompare(b.sortName));
  }, [filteredSkillsUnselected, filteredServerViewsUnselected]);

  // - We compare by name, not sId, because names are shared between multiple instances of the same MCP server (sIds are not).
  // - We filter by manual availability to show only servers that need install step, and by search text if present.
  // - We don't compute uninstalled servers until BOTH data sources have loaded to prevent flicker.
  const filteredUninstalledServers = useMemo(() => {
    if (!isAdmin || !isToolsDataReady || !shouldFetchToolsData) {
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
    isToolsDataReady,
    shouldFetchToolsData,
    serverViews,
    availableMCPServers,
    searchText,
  ]);

  const shouldShowSetupSheet = useMemo(() => {
    return !!setupSheetServer || !!setupSheetRemoteServerConfig;
  }, [setupSheetServer, setupSheetRemoteServerConfig]);

  const hasVisibleItems =
    mergedItems.length > 0 || filteredUninstalledServers.length > 0;
  const hasNoVisibleItems =
    isSkillsDataReady && isToolsDataReady && !hasVisibleItems;

  return (
    <>
      <DropdownMenu
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (open) {
            setIsClosing(false);
            trackEvent({
              area: TRACKING_AREAS.TOOLS,
              object: "tool_picker",
              action: TRACKING_ACTIONS.OPEN,
            });
            setSearchText("");
          } else {
            setIsClosing(true);
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            icon={ToolsIcon}
            variant="ghost-secondary"
            size={buttonSize}
            tooltip="Capabilities"
            disabled={disabled || isLoading}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="max-h-96 w-64"
          align="start"
          onAnimationEnd={() => {
            if (!isOpen) {
              setIsClosing(false);
            }
          }}
          dropdownHeaders={
            <DropdownMenuSearchbar
              autoFocus
              name="search-capabilities"
              placeholder="Search capabilities"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && mergedItems.length > 0) {
                  const first = mergedItems[0];
                  if (first.kind === "skill") {
                    trackEvent({
                      area: TRACKING_AREAS.TOOLS,
                      object: "skill_select",
                      action: TRACKING_ACTIONS.SELECT,
                      extra: {
                        skill_id: first.skill.sId,
                        skill_name: first.skill.name,
                      },
                    });
                    onSkillSelect(first.skill);
                  } else {
                    trackEvent({
                      area: TRACKING_AREAS.TOOLS,
                      object: "tool_select",
                      action: TRACKING_ACTIONS.SELECT,
                      extra: {
                        tool_id: first.serverView.sId,
                        tool_name: first.serverView.server.name,
                      },
                    });
                    onSelect(first.serverView);
                  }
                  setSearchText("");
                  setIsOpen(false);
                }
              }}
            />
          }
        >
          {(!isSkillsDataReady || !isToolsDataReady) && (
            <CapabilitiesPickerLoading />
          )}

          {isSkillsDataReady &&
            isToolsDataReady &&
            mergedItems.map((item) => {
              switch (item.kind) {
                case "skill":
                  return (
                    <SkillMenuItem
                      key={`skills-picker-${item.skill.sId}`}
                      skill={item.skill}
                      onSelect={onSkillSelect}
                      onDetails={(sId) => void fetchSkillWithRelations(sId)}
                      closeDropdown={() => setIsOpen(false)}
                    />
                  );
                case "tool":
                  return (
                    <ToolMenuItem
                      key={`capabilities-picker-${item.serverView.sId}`}
                      serverView={item.serverView}
                      onSelect={onSelect}
                      onDetails={setSelectedServerViewForDetails}
                      closeDropdown={() => setIsOpen(false)}
                    />
                  );
                default:
                  return null;
              }
            })}

          {isToolsDataReady &&
            filteredUninstalledServers.length > 0 &&
            filteredUninstalledServers.map((server) => (
              <UninstalledToolMenuItem
                key={`tools-to-install-${server.sId}`}
                server={server}
                onSetup={(server) => {
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

          {hasNoVisibleItems && (
            <DropdownMenuItem
              id="capabilities-picker-no-selected"
              icon={() => <Icon visual={BoltIcon} size="xs" />}
              label={
                searchText.length > 0
                  ? "No result"
                  : "No more skills or tools to select"
              }
              truncateText
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

      {user && (
        <SkillDetailsSheet
          skill={selectedSkillForDetails}
          onClose={() => setSelectedSkillForDetails(null)}
          owner={owner}
          user={user}
        />
      )}

      <MCPServerDetails
        owner={owner}
        mcpServerView={selectedServerViewForDetails}
        isOpen={!!selectedServerViewForDetails}
        onClose={() => setSelectedServerViewForDetails(null)}
        readOnly
      />
    </>
  );
}
