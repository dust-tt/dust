import { CreateMCPServerDialog } from "@app/components/actions/mcp/create/CreateMCPServerDialog";
import {
  matchesSlashCommandCapabilityQuery,
  sortSlashCommandCapabilityMatches,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { CapabilityDetailsSheets } from "@app/components/shared/CapabilityDetailsSheets";
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
import { useSkills } from "@app/lib/swr/skill_configurations";
import { useSpaces } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { UserType, WorkspaceType } from "@app/types/user";
import type { DropdownMenuItemProps } from "@dust-tt/sparkle";
import {
  Button,
  Chip,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LoadingBlock,
  ShapesPlus,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

interface CapabilityPickerItemBase {
  description?: string;
  icon: DropdownMenuItemProps["icon"];
  id: string;
  label: string;
  sortName: string;
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
  onSkillDetails: (skillId: string) => void;
  onToolDetails: (serverView: MCPServerViewType) => void;
}

function CapabilitiesPickerItemsList({
  emptyMessage,
  items,
  onItemSelect,
  onSkillDetails,
  onToolDetails,
}: CapabilitiesPickerItemsListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div ref={listRef}>
      {items.map((item) => {
        const endComponent =
          item.kind === "uninstalled_tool" ? (
            <Chip size="xs" color="golden" label="Configure" />
          ) : (
            <Button
              icon={DotsHorizontal}
              variant="outline"
              size="mini"
              className="opacity-0 group-data-[highlighted]:opacity-100 group-focus-within:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();

                if (item.kind === "skill") {
                  onSkillDetails(item.skill.sId);
                } else {
                  onToolDetails(item.serverView);
                }
              }}
            />
          );

        return (
          <DropdownMenuItem
            key={item.id}
            icon={item.icon}
            itemId={item.id}
            label={item.label}
            description={item.description}
            truncateText
            endComponent={endComponent}
            className="group"
            onClick={() => onItemSelect(item)}
          />
        );
      })}
    </div>
  );
}

interface CapabilitiesPickerProps {
  owner: WorkspaceType;
  user: UserType | null;
  selectedMCPServerViews: MCPServerViewType[];
  onSelect: (serverView: MCPServerViewType) => void;
  onSkillSelect: (skill: SkillWithoutInstructionsAndToolsType) => void;
  isLoading?: boolean;
  disabled?: boolean;
  buttonSize?: "xs" | "sm" | "md";
  onOpenChange?: (open: boolean) => void;
}

export function CapabilitiesPicker({
  owner,
  user,
  selectedMCPServerViews,
  onSelect,
  onSkillSelect,
  isLoading = false,
  disabled = false,
  buttonSize = "xs",
  onOpenChange,
}: CapabilitiesPickerProps) {
  const isMobile = useIsMobile();
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

  const [selectedSkillIdForDetails, setSelectedSkillIdForDetails] = useState<
    string | null
  >(null);
  const [selectedServerViewForDetails, setSelectedServerViewForDetails] =
    useState<MCPServerViewType | null>(null);

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

  const normalizedSearchText = searchText.trim().toLowerCase();

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
  });

  const isSkillsDataReady = !isSkillsLoading;
  const isToolsDataReady =
    !isServerViewsLoading && !isAvailableMCPServersLoading;

  const shouldShowSetupSheet =
    !!setupSheetServer || !!setupSheetRemoteServerConfig;

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
        return selectSkill(item.skill);
      case "tool":
        return selectTool(item.serverView);
      case "uninstalled_tool":
        return setupServer(item.server);
      default:
        assertNeverAndIgnore(item);
    }
  };

  const capabilityPickerItems = (() => {
    const items: CapabilityPickerItem[] = [];
    const selectedMCPServerViewIds = new Set(
      selectedMCPServerViews.map((v) => v.sId)
    );

    if (isSkillsDataReady && isToolsDataReady) {
      for (const skill of skills) {
        const description = skill.userFacingDescription;

        if (
          !matchesSlashCommandCapabilityQuery({
            description,
            label: skill.name,
            query: normalizedSearchText,
          })
        ) {
          continue;
        }

        items.push({
          kind: "skill",
          skill,
          id: `skills-picker-${skill.sId}`,
          icon: getSkillAvatarIcon(skill),
          label: skill.name,
          sortName: skill.name.toLowerCase(),
          description,
        });
      }

      for (const serverView of serverViews) {
        const label = getMcpServerViewDisplayName(serverView);
        const description = getMcpServerViewDescription(serverView);

        if (
          !isJITMCPServerView(serverView) ||
          selectedMCPServerViewIds.has(serverView.sId) ||
          !matchesSlashCommandCapabilityQuery({
            description,
            label,
            query: normalizedSearchText,
          })
        ) {
          continue;
        }

        items.push({
          kind: "tool",
          serverView,
          id: `capabilities-picker-${serverView.sId}`,
          icon: () => getAvatar(serverView.server),
          label,
          sortName: label.toLowerCase(),
          description,
        });
      }
    }

    if (isAdmin && isToolsDataReady && shouldFetchToolsData) {
      const installedServerNames = new Set(
        serverViews.map((v) => v.server.name)
      );

      for (const server of availableMCPServers) {
        const label = asDisplayName(server.name);
        const description = server.description;

        if (
          installedServerNames.has(server.name) ||
          server.availability !== "manual" ||
          !matchesSlashCommandCapabilityQuery({
            description,
            label,
            query: normalizedSearchText,
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
          description,
        });
      }
    }

    const installedItems = items.filter((i) => i.kind !== "uninstalled_tool");
    const uninstalledItems = items.filter((i) => i.kind === "uninstalled_tool");
    return [
      ...sortSlashCommandCapabilityMatches({
        items: installedItems,
        normalizedQuery: normalizedSearchText,
      }),
      ...sortSlashCommandCapabilityMatches({
        items: uninstalledItems,
        normalizedQuery: normalizedSearchText,
      }),
    ];
  })();

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
          onOpenChange?.(open);
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
            icon={ShapesPlus}
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
          dropdownHeaders={
            <>
              <DropdownMenuSearchbar
                autoFocus={!isMobile}
                name="search-capabilities"
                placeholder="Search capabilities"
                value={searchText}
                onChange={setSearchText}
              />
              <DropdownMenuSeparator />
            </>
          }
        >
          {(!isSkillsDataReady || !isToolsDataReady) && (
            <CapabilitiesPickerLoading />
          )}

          {shouldShowCapabilityDropdownList && (
            <CapabilitiesPickerItemsList
              emptyMessage={
                normalizedSearchText.length > 0
                  ? "No capabilities found"
                  : "No more capabilities to select"
              }
              items={capabilityPickerItems}
              onItemSelect={selectCapabilityPickerItem}
              onSkillDetails={(skillId) => {
                setSelectedSkillIdForDetails(skillId);
                setIsOpen(false);
              }}
              onToolDetails={(serverView) => {
                setSelectedServerViewForDetails(serverView);
                setIsOpen(false);
              }}
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

      <CapabilityDetailsSheets
        owner={owner}
        user={user}
        selectedSkillId={selectedSkillIdForDetails}
        selectedMCPServerView={selectedServerViewForDetails}
        onCloseSkill={() => setSelectedSkillIdForDetails(null)}
        onCloseTool={() => setSelectedServerViewForDetails(null)}
      />
    </>
  );
}
