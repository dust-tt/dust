import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useMCPServerViewsFromSpaces } from "@app/lib/swr/mcp_servers";
import { useSkills } from "@app/lib/swr/skill_configurations";
import { useSpaces } from "@app/lib/swr/spaces";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import type { SuggestionProps } from "@tiptap/suggestion";
import {
  forwardRef,
  type RefObject,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import type { InputBarSlashSuggestionCapability } from "./InputBarSlashSuggestionTypes";

const MAX_SLASH_SUGGESTIONS = 10;

function matchesCapabilityQuery({
  description,
  label,
  query,
}: {
  description?: string;
  label: string;
  query: string;
}) {
  if (query.length === 0) {
    return true;
  }

  return (
    label.toLowerCase().includes(query) ||
    description?.toLowerCase().includes(query) === true
  );
}

export function filterInputBarSlashSuggestions({
  query,
  selectedMCPServerViewIds,
  selectedSkillIds,
  serverViews,
  skills,
}: {
  query: string;
  selectedMCPServerViewIds: Set<string>;
  selectedSkillIds: Set<string>;
  serverViews: MCPServerViewType[];
  skills: SkillWithoutInstructionsAndToolsType[];
}): InputBarSlashSuggestionCapability[] {
  const normalizedQuery = query.trim().toLowerCase();

  const capabilities: (InputBarSlashSuggestionCapability & {
    sortName: string;
  })[] = [
    ...skills
      .filter((skill) => !selectedSkillIds.has(skill.sId))
      .filter((skill) =>
        matchesCapabilityQuery({
          label: skill.name,
          description: skill.userFacingDescription,
          query: normalizedQuery,
        })
      )
      .map((skill) => ({
        kind: "skill" as const,
        skill,
        sortName: skill.name.toLowerCase(),
      })),
    ...serverViews
      .filter((serverView) => isJITMCPServerView(serverView))
      .filter((serverView) => !selectedMCPServerViewIds.has(serverView.sId))
      .filter((serverView) =>
        matchesCapabilityQuery({
          label: getMcpServerViewDisplayName(serverView),
          description: getMcpServerViewDescription(serverView),
          query: normalizedQuery,
        })
      )
      .map((serverView) => ({
        kind: "tool" as const,
        serverView,
        sortName: getMcpServerViewDisplayName(serverView).toLowerCase(),
      })),
  ];

  return capabilities
    .toSorted((a, b) => a.sortName.localeCompare(b.sortName))
    .map(({ sortName: _sortName, ...capability }) => capability)
    .slice(0, MAX_SLASH_SUGGESTIONS);
}

export const InputBarSlashSuggestionDropdown = forwardRef<
  SlashCommandDropdownRef,
  Pick<
    SuggestionProps<InputBarSlashSuggestionCapability>,
    "clientRect" | "command" | "query"
  > & {
    onClose: () => void;
    owner: LightWorkspaceType;
    selectedMCPServerViewIdsRef: RefObject<Set<string>>;
    selectedSkillIdsRef: RefObject<Set<string>>;
  }
>(
  (
    {
      clientRect,
      command,
      query,
      onClose,
      owner,
      selectedMCPServerViewIdsRef,
      selectedSkillIdsRef,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const isOpen = Boolean(clientRect);
    const { spaces: globalSpaces, isSpacesLoading } = useSpaces({
      disabled: !isOpen,
      workspaceId: owner.sId,
      kinds: ["global"],
    });
    const { skills, isSkillsLoading } = useSkills({
      disabled: !isOpen,
      owner,
      status: "active",
      globalSpaceOnly: true,
      viewType: "summary",
    });
    const { serverViews, isLoading: isServerViewsLoading } =
      useMCPServerViewsFromSpaces(owner, globalSpaces, { disabled: !isOpen });

    const filteredCapabilities = useMemo(
      () =>
        filterInputBarSlashSuggestions({
          query,
          selectedMCPServerViewIds:
            selectedMCPServerViewIdsRef.current ?? new Set<string>(),
          selectedSkillIds: selectedSkillIdsRef.current ?? new Set<string>(),
          serverViews,
          skills,
        }),
      [
        query,
        selectedMCPServerViewIdsRef,
        selectedSkillIdsRef,
        serverViews,
        skills,
      ]
    );

    const capabilityItems = useMemo<SlashCommand[]>(
      () =>
        filteredCapabilities.flatMap((capability) => {
          switch (capability.kind) {
            case "skill":
              return [
                {
                  action: "select-skill",
                  description: capability.skill.userFacingDescription,
                  icon: getSkillAvatarIcon(capability.skill.icon),
                  id: capability.skill.sId,
                  label: capability.skill.name,
                  tooltip: capability.skill.userFacingDescription
                    ? {
                        description: capability.skill.userFacingDescription,
                      }
                    : undefined,
                },
              ];
            case "tool": {
              const description = getMcpServerViewDescription(
                capability.serverView
              );

              return [
                {
                  action: "select-tool",
                  description,
                  icon: () => getAvatar(capability.serverView.server),
                  id: capability.serverView.sId,
                  label: getMcpServerViewDisplayName(capability.serverView),
                  tooltip: description
                    ? {
                        description,
                      }
                    : undefined,
                },
              ];
            }
            default:
              assertNeverAndIgnore(capability);
              return [];
          }
        }),
      [filteredCapabilities]
    );

    const isCapabilitiesLoading =
      isSkillsLoading || isSpacesLoading || isServerViewsLoading;

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (
            (event.key === "Enter" || event.key === "Tab") &&
            (isCapabilitiesLoading || capabilityItems.length === 0)
          ) {
            event.preventDefault();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [capabilityItems.length, isCapabilitiesLoading]
    );

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        items={capabilityItems}
        command={(item) => {
          const capability = filteredCapabilities.find((capability) =>
            capability.kind === "skill"
              ? capability.skill.sId === item.id
              : capability.serverView.sId === item.id
          );

          if (capability) {
            command(capability);
          }
        }}
        clientRect={clientRect}
        emptyMessage={
          isCapabilitiesLoading
            ? "Loading capabilities…"
            : "No capabilities found"
        }
        header="Capabilities"
        onClose={onClose}
        size="wide"
      />
    );
  }
);

InputBarSlashSuggestionDropdown.displayName = "InputBarSlashSuggestionDropdown";
