import { CreateMCPServerDialog } from "@app/components/actions/mcp/create/CreateMCPServerDialog";
import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import {
  compareCapabilitySearchResults,
  matchesCapabilitySearchQuery,
  normalizeCapabilitySearchQuery,
} from "@app/components/shared/capability_search";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
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
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import type {
  SkillWithoutInstructionsAndToolsType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { UserType, WorkspaceType } from "@app/types/user";
import type { DropdownMenuItemProps } from "@dust-tt/sparkle";
import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
  LoadingBlock,
  MoreIcon,
  ToolsIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

// Search bar is 3rem tall. Seven 3.25rem capability rows gives a 25.75rem
// dropdown body, matching the slash suggestion row count.
const CAPABILITIES_PICKER_LIST_MAX_HEIGHT_CLASS_NAME = "max-h-[22.75rem]";

interface CapabilityPickerItemBase {
  description?: string;
  endComponent?: React.ReactNode;
  icon: DropdownMenuItemProps["icon"];
  id: string;
  label: string;
  sortName: string;
  tooltip?: {
    description: string;
    media?: React.ReactNode;
  };
}

type CapabilityPickerItem = CapabilityPickerItemBase &
  (
    | {
        kind: "skill";
        skill: SkillWithoutInstructionsAndToolsType;
      }
    | {
        kind: "tool";
        serverView: MCPServerViewType;
      }
    | {
        kind: "uninstalled_tool";
        server: MCPServerType;
      }
  );

function getCapabilityPickerItemGroupOrder(item: CapabilityPickerItem) {
  return item.kind === "uninstalled_tool" ? 1 : 0;
}

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

interface CapabilitiesPickerItemsListProps {
  emptyMessage: string;
  items: CapabilityPickerItem[];
  onItemSelect: (item: CapabilityPickerItem) => void;
}

function CapabilitiesPickerItemsList({
  emptyMessage,
  items,
  onItemSelect,
}: CapabilitiesPickerItemsListProps) {
  if (items.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={`overflow-y-auto ${CAPABILITIES_PICKER_LIST_MAX_HEIGHT_CLASS_NAME}`}
    >
      {items.map((item) => {
        const menuItem = (
          <DropdownMenuItem
            key={item.id}
            icon={item.icon}
            itemId={item.id}
            label={item.label}
            description={item.description}
            truncateText
            endComponent={item.endComponent}
            className="group"
            onClick={() => onItemSelect(item)}
          />
        );

        if (item.tooltip) {
          return (
            <DropdownTooltipTrigger
              key={item.id}
              description={item.tooltip.description}
              media={item.tooltip.media}
              side="right"
              sideOffset={8}
            >
              {menuItem}
            </DropdownTooltipTrigger>
          );
        }

        return menuItem;
      })}
    </div>
  );
}

interface CapabilitiesPickerProps {
  owner: WorkspaceType;
  user: UserType | null;
  selectedMCPServerViews: MCPServerViewType[];
  onSelect: (serverView: MCPServerViewType) => void;
  selectedSkills: SkillWithoutInstructionsAndToolsType[];
  onSkillSelect: (skill: SkillWithoutInstructionsAndToolsType) => void;
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
    () => new Set(selectedMCPServerViews.map((v) => v.sId)),
    [selectedMCPServerViews]
  );

  const selectedSkillIds = useMemo(
    () => new Set(selectedSkills.map((s) => s.sId)),
    [selectedSkills]
  );

  const normalizedSearchText = useMemo(
    () => normalizeCapabilitySearchQuery(searchText),
    [searchText]
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

  const existingViewNames = useMemo(
    () => serverViews.map((v) => v.name ?? v.server.name),
    [serverViews]
  );

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
    viewType: "summary",
  });

  const isSkillsDataReady = !isSkillsLoading;
  const isToolsDataReady =
    !isServerViewsLoading && !isAvailableMCPServersLoading;

  const shouldShowSetupSheet = useMemo(() => {
    return !!setupSheetServer || !!setupSheetRemoteServerConfig;
  }, [setupSheetServer, setupSheetRemoteServerConfig]);

  const closeDropdown = () => {
    setSearchText("");
    setIsOpen(false);
  };

  const selectSkill = (skill: SkillWithoutInstructionsAndToolsType) => {
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
    closeDropdown();
  };

  const selectTool = (serverView: MCPServerViewType) => {
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
  };

  const setupServer = (server: MCPServerType) => {
    const remoteMcpServerConfig = getDefaultRemoteMCPServerByName(server.name);

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
  };

  const selectCapabilityPickerItem = (item: CapabilityPickerItem) => {
    switch (item.kind) {
      case "skill":
        selectSkill(item.skill);
        return;
      case "tool":
        selectTool(item.serverView);
        return;
      case "uninstalled_tool":
        setupServer(item.server);
        return;
    }
  };

  const capabilityPickerItems = useMemo<CapabilityPickerItem[]>(() => {
    const items: CapabilityPickerItem[] = [];

    if (isSkillsDataReady && isToolsDataReady) {
      for (const skill of skills) {
        if (
          selectedSkillIds.has(skill.sId) ||
          !matchesCapabilitySearchQuery({
            label: skill.name,
            normalizedQuery: normalizedSearchText,
          })
        ) {
          continue;
        }

        const description = skill.userFacingDescription;

        items.push({
          kind: "skill",
          skill,
          id: `skills-picker-${skill.sId}`,
          icon: getSkillAvatarIcon(skill.icon),
          label: skill.name,
          sortName: skill.name.toLowerCase(),
          description,
          tooltip: description ? { description } : undefined,
          endComponent: (
            <Button
              icon={MoreIcon}
              variant="outline"
              size="mini"
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void fetchSkillWithRelations(skill.sId);
                setIsOpen(false);
              }}
            />
          ),
        });
      }

      for (const serverView of serverViews) {
        const label = getMcpServerViewDisplayName(serverView);

        if (
          !isJITMCPServerView(serverView) ||
          selectedMCPServerViewIds.has(serverView.sId) ||
          !matchesCapabilitySearchQuery({
            label,
            normalizedQuery: normalizedSearchText,
          })
        ) {
          continue;
        }

        const description = getMcpServerViewDescription(serverView);

        items.push({
          kind: "tool",
          serverView,
          id: `capabilities-picker-${serverView.sId}`,
          icon: () => getAvatar(serverView.server),
          label,
          sortName: label.toLowerCase(),
          description,
          tooltip: description ? { description } : undefined,
          endComponent: (
            <Button
              icon={MoreIcon}
              variant="outline"
              size="mini"
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setSelectedServerViewForDetails(serverView);
                setIsOpen(false);
              }}
            />
          ),
        });
      }
    }

    if (isAdmin && isToolsDataReady && shouldFetchToolsData) {
      const installedServerNames = new Set(
        serverViews.map((v) => v.server.name)
      );

      for (const server of availableMCPServers) {
        const label = asDisplayName(server.name);

        if (
          installedServerNames.has(server.name) ||
          server.availability !== "manual" ||
          !matchesCapabilitySearchQuery({
            label,
            normalizedQuery: normalizedSearchText,
          })
        ) {
          continue;
        }

        items.push({
          kind: "uninstalled_tool",
          server,
          id: `tools-to-install-${server.sId}`,
          icon: () => getAvatar(server),
          label,
          sortName: label.toLowerCase(),
          description: server.description,
          endComponent: <Chip size="xs" color="golden" label="Configure" />,
        });
      }
    }

    return items.toSorted((a, b) => {
      const groupComparison =
        getCapabilityPickerItemGroupOrder(a) -
        getCapabilityPickerItemGroupOrder(b);

      if (groupComparison !== 0) {
        return groupComparison;
      }

      return compareCapabilitySearchResults({
        normalizedQuery: normalizedSearchText,
        a: a.sortName,
        b: b.sortName,
      });
    });
  }, [
    availableMCPServers,
    fetchSkillWithRelations,
    isAdmin,
    isSkillsDataReady,
    isToolsDataReady,
    normalizedSearchText,
    selectedMCPServerViewIds,
    selectedSkillIds,
    serverViews,
    shouldFetchToolsData,
    skills,
  ]);

  const hasNoVisibleItems =
    isSkillsDataReady && isToolsDataReady && capabilityPickerItems.length === 0;

  const shouldShowCapabilityDropdownList =
    capabilityPickerItems.length > 0 || hasNoVisibleItems;

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
          className="w-80"
          align="start"
          onAnimationEnd={() => {
            if (!isOpen) {
              setIsClosing(false);
            }
          }}
        >
          <DropdownMenuSearchbar
            autoFocus
            name="search-capabilities"
            placeholder="Search capabilities"
            value={searchText}
            onChange={setSearchText}
            onKeyDown={(e) => {
              const firstItem = capabilityPickerItems[0];

              if (e.key === "Enter" && firstItem) {
                e.preventDefault();
                selectCapabilityPickerItem(firstItem);
              }
            }}
          />
          {(!isSkillsDataReady || !isToolsDataReady) && (
            <CapabilitiesPickerLoading />
          )}

          {shouldShowCapabilityDropdownList && (
            <CapabilitiesPickerItemsList
              emptyMessage={
                searchText.length > 0
                  ? "No capabilities found"
                  : "No more capabilities to select"
              }
              items={capabilityPickerItems}
              onItemSelect={selectCapabilityPickerItem}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {shouldShowSetupSheet && (
        <CreateMCPServerDialog
          owner={owner}
          internalMCPServer={setupSheetServer ?? undefined}
          defaultServerConfig={setupSheetRemoteServerConfig ?? undefined}
          existingViewNames={existingViewNames}
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
