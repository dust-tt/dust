import { CreateMCPServerDialog } from "@app/components/actions/mcp/create/CreateMCPServerDialog";
import type { CapabilitySearchIndexItem } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { searchCapabilityIndex } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { CapabilityDetailsSheets } from "@app/components/shared/CapabilityDetailsSheets";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getDefaultRemoteMCPServerByName } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { MCPServerType, MCPServerViewLightType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { CAPABILITIES_SWR_OPTIONS } from "@app/lib/swr/capabilities";
import {
  useAvailableMCPServers,
  useJITMCPServerViewsFromSpaces,
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
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
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
  DropdownMenuPanel,
  DropdownMenuPanelRoot,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LoadingBlock,
  ShapesPlus,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface CapabilityPickerItemBase extends CapabilitySearchIndexItem {
  description?: string;
  id: string;
  isFavorite?: boolean;
  label: string;
}

type CapabilityPickerSearchItem = CapabilityPickerItemBase &
  (
    | {
        kind: "skill";
        skill: SkillWithoutInstructionsAndToolsType;
      }
    | {
        kind: "tool";
        serverView: MCPServerViewLightType;
      }
    | {
        kind: "uninstalled_tool";
        server: MCPServerType;
      }
  );

type CapabilityPickerItem = CapabilityPickerSearchItem & {
  icon: DropdownMenuItemProps["icon"];
};

function CapabilitiesPickerLoading({ count = 5 }: { count?: number }) {
  return (
    <div className="py-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={`capabilities-picker-loading-${i}`} className="px-1 py-1">
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

interface CapabilitiesPickerItemsListProps {
  emptyMessage: string;
  items: CapabilityPickerItem[];
  onItemSelect: (item: CapabilityPickerItem) => void;
  onSkillDetails?: (skillId: string) => void;
  onToolDetails?: (serverView: MCPServerViewLightType) => void;
}

export function CapabilitiesPickerItemsList({
  emptyMessage,
  items,
  onItemSelect,
  onSkillDetails,
  onToolDetails,
}: CapabilitiesPickerItemsListProps) {
  if (items.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => {
        const endComponent =
          item.kind === "uninstalled_tool" ? (
            <Chip size="xs" color="info" label="Configure" />
          ) : onSkillDetails && onToolDetails ? (
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
          ) : undefined;

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
  selectedMCPServerViews: MCPServerViewLightType[];
  onSelect: (serverView: MCPServerViewLightType) => void;
  onSkillSelect: (skill: SkillWithoutInstructionsAndToolsType) => void;
  onSetupServer: (server: MCPServerType) => void;
  isLoading?: boolean;
  disabled?: boolean;
  buttonSize?: "xs" | "sm" | "md";
  onOpenChange?: (open: boolean) => void;
  type?: "dropdown" | "panel";
  onBack?: () => void;
  onClose?: () => void;
  onShowSkillDetails?: (skillId: string) => void;
  onShowToolDetails?: (serverView: MCPServerViewLightType) => void;
}

export function CapabilitiesPicker({
  owner,
  user,
  selectedMCPServerViews,
  onSelect,
  onSkillSelect,
  onSetupServer,
  isLoading = false,
  disabled = false,
  buttonSize = "xs",
  onOpenChange,
  type = "dropdown",
  onBack,
  onClose,
  onShowSkillDetails,
  onShowToolDetails,
}: CapabilitiesPickerProps) {
  const isMobile = useIsMobile();
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const isPanel = type === "panel";

  const [selectedSkillIdForDetails, setSelectedSkillIdForDetails] = useState<
    string | null
  >(null);
  const [selectedServerViewForDetails, setSelectedServerViewForDetails] =
    useState<MCPServerViewLightType | null>(null);

  // Load capabilities when the picker mounts so the picker and slash menu share a warm SWR cache.
  const { spaces: globalSpaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
    swrOptions: CAPABILITIES_SWR_OPTIONS,
  });

  const isAdmin = owner.role === "admin";

  const { serverViews, isLoading: isServerViewsLoading } =
    useJITMCPServerViewsFromSpaces(
      owner,
      globalSpaces,
      CAPABILITIES_SWR_OPTIONS
    );

  const normalizedSearchText = searchText.trim().toLowerCase();

  const { availableMCPServers, isAvailableMCPServersLoading } =
    useAvailableMCPServers({
      owner,
      disabled: !isAdmin,
      swrOptions: CAPABILITIES_SWR_OPTIONS,
    });

  const { skills, isSkillsLoading } = useSkills({
    owner,
    status: "active",
    swrOptions: CAPABILITIES_SWR_OPTIONS,
  });

  const isSkillsDataReady = !isSkillsLoading;
  const isToolsDataReady =
    !isServerViewsLoading && (!isAdmin || !isAvailableMCPServersLoading);

  const closePicker = () => {
    if (isPanel) {
      onClose?.();
      return;
    }
    setIsOpen(false);
  };

  const closeDropdown = () => {
    setSearchText("");
    closePicker();
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

  const selectTool = (serverView: MCPServerViewLightType) => {
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
    onSetupServer(server);
    closePicker();
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

  const capabilityPickerIndex = useMemo(() => {
    const items: CapabilityPickerSearchItem[] = [];
    const selectedMCPServerViewIds = new Set(
      selectedMCPServerViews.map((v) => v.sId)
    );

    if (isSkillsDataReady && isToolsDataReady) {
      for (const skill of skills) {
        const description = skill.userFacingDescription;

        items.push({
          kind: "skill",
          skill,
          id: `skills-picker-${skill.sId}`,
          isFavorite: skill.isFavorite ?? false,
          label: skill.name,
          sortName: skill.name.toLowerCase(),
          description,
          normalizedDescription: description?.toLowerCase(),
        });
      }

      // The JIT views endpoint only returns views whose tools can be enabled directly in a
      // conversation, no further filtering needed here.
      for (const serverView of serverViews) {
        const label = getMcpServerViewDisplayName(serverView);
        const description = getMcpServerViewDescription(serverView);

        if (selectedMCPServerViewIds.has(serverView.sId)) {
          continue;
        }

        items.push({
          kind: "tool",
          serverView,
          id: `capabilities-picker-${serverView.sId}`,
          label,
          sortName: label.toLowerCase(),
          description,
          normalizedDescription: description?.toLowerCase(),
        });
      }
    }

    if (isAdmin && isToolsDataReady) {
      const installedServerNames = new Set(
        serverViews.map((v) => v.server.name)
      );

      for (const server of availableMCPServers) {
        const label = asDisplayName(server.name);
        const description = server.description;

        if (
          installedServerNames.has(server.name) ||
          server.availability !== "manual"
        ) {
          continue;
        }

        items.push({
          kind: "uninstalled_tool",
          server,
          id: `tools-to-install-${server.sId}`,
          label,
          sortName: label.toLowerCase(),
          sortGroup: 1,
          description,
          normalizedDescription: description?.toLowerCase(),
        });
      }
    }

    return items;
  }, [
    availableMCPServers,
    isAdmin,
    isSkillsDataReady,
    isToolsDataReady,
    selectedMCPServerViews,
    serverViews,
    skills,
  ]);

  const capabilityPickerSearchResults = useMemo(
    () =>
      searchCapabilityIndex({
        items: capabilityPickerIndex,
        query: normalizedSearchText,
      }),
    [capabilityPickerIndex, normalizedSearchText]
  );

  const capabilityPickerItems = useMemo(
    () =>
      capabilityPickerSearchResults.map((item) => {
        switch (item.kind) {
          case "skill": {
            const SkillAvatar = getSkillAvatarIcon(item.skill);
            return { ...item, icon: <SkillAvatar size="xs" /> };
          }
          case "tool":
            return { ...item, icon: getAvatar(item.serverView.server, "xs") };
          case "uninstalled_tool":
            return { ...item, icon: getAvatar(item.server, "xs") };
          default:
            return assertNever(item);
        }
      }),
    [capabilityPickerSearchResults]
  );

  const hasNoVisibleItems =
    isSkillsDataReady && isToolsDataReady && capabilityPickerItems.length === 0;

  const shouldShowCapabilityDropdownList =
    capabilityPickerItems.length > 0 || hasNoVisibleItems;

  const Wrapper = isPanel ? DropdownMenuPanelRoot : DropdownMenu;
  const ContentWrapper = isPanel ? DropdownMenuPanel : DropdownMenuContent;

  return (
    <>
      <Wrapper
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          onOpenChange?.(open);
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
        {!isPanel && (
          <DropdownMenuTrigger asChild>
            <Button
              icon={ShapesPlus}
              variant="ghost-secondary"
              size={buttonSize}
              tooltip="Capabilities"
              disabled={disabled || isLoading}
            />
          </DropdownMenuTrigger>
        )}
        <ContentWrapper
          className={
            isPanel ? "h-80 w-full xs:h-96" : "w-80 max-w-[calc(100vw-1rem)]"
          }
          {...(isPanel
            ? { title: "Capabilities", onBack: () => onBack?.() }
            : {
                collisionPadding: 8,
                align: "start" as const,
                onInteractOutside: () => setIsOpen(false),
              })}
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
                (onShowSkillDetails ?? setSelectedSkillIdForDetails)(skillId);
                closePicker();
              }}
              onToolDetails={(serverView) => {
                (onShowToolDetails ?? setSelectedServerViewForDetails)(
                  serverView
                );
                closePicker();
              }}
            />
          )}
        </ContentWrapper>
      </Wrapper>

      {!isPanel && (
        <CapabilityDetailsSheets
          owner={owner}
          user={user}
          selectedSkillId={selectedSkillIdForDetails}
          selectedMCPServerView={selectedServerViewForDetails}
          onCloseSkill={() => setSelectedSkillIdForDetails(null)}
          onCloseTool={() => setSelectedServerViewForDetails(null)}
        />
      )}
    </>
  );
}

interface CapabilitySetupDialogProps {
  owner: WorkspaceType;
  server: MCPServerType;
  onClose: () => void;
  onServerViewAdded: (serverView: MCPServerViewLightType) => void;
}

// Mount outside of the menu the picker lives in: selecting an item closes that menu, which
// unmounts its content.
export function CapabilitySetupDialog({
  owner,
  server,
  onClose,
  onServerViewAdded,
}: CapabilitySetupDialogProps) {
  const { spaces: globalSpaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
    swrOptions: CAPABILITIES_SWR_OPTIONS,
  });

  const { serverViews, mutateServerViews } = useJITMCPServerViewsFromSpaces(
    owner,
    globalSpaces,
    CAPABILITIES_SWR_OPTIONS
  );

  // Remote servers always use the remote flow, even if they have OAuth.
  const remoteServerConfig = getDefaultRemoteMCPServerByName(server.name);

  return (
    <CreateMCPServerDialog
      owner={owner}
      internalMCPServer={remoteServerConfig ? undefined : server}
      defaultServerConfig={remoteServerConfig ?? undefined}
      existingViewNames={serverViews.map((v) => v.name ?? v.server.name)}
      setMCPServerToShow={async (newServer) => {
        const updatedData = await mutateServerViews();

        const newServerView = updatedData?.serverViews?.find(
          (v: MCPServerViewLightType) => v.server.name === newServer.name
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
          onServerViewAdded(newServerView);
        }
      }}
      setIsLoading={() => {}}
      isOpen
      setIsOpen={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    />
  );
}
