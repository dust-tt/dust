import {
  getSkillSlashCommandItem,
  getToolSlashCommandItem,
  getToolSlashCommandLabel,
  matchesSlashCommandCapabilityQuery,
  sortSlashCommandCapabilityMatches,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
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

// Rare case where we need a Tailwind arbitrary value: after the fixed search bar, the scrollable list should fit
// exactly seven 3.25rem rows without showing a partial row or leaving extra bottom space.
const LIST_MAX_HEIGHT_CLASS_NAME = "max-h-[22.75rem]";

export function filterInputBarSlashSuggestions({
  query,
  selectedMCPServerViewIds,
  serverViews,
  skills,
}: {
  query: string;
  selectedMCPServerViewIds: Set<string>;
  serverViews: MCPServerViewType[];
  skills: SkillWithoutInstructionsAndToolsType[];
}): InputBarSlashSuggestionCapability[] {
  const normalizedQuery = query.trim().toLowerCase();

  const capabilities: (InputBarSlashSuggestionCapability & {
    sortName: string;
  })[] = [
    ...skills
      .filter((skill) =>
        matchesSlashCommandCapabilityQuery({
          label: skill.name,
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
        matchesSlashCommandCapabilityQuery({
          label: getToolSlashCommandLabel(serverView),
          query: normalizedQuery,
        })
      )
      .map((serverView) => ({
        kind: "tool" as const,
        serverView,
        sortName: getToolSlashCommandLabel(serverView).toLowerCase(),
      })),
  ];

  return sortSlashCommandCapabilityMatches({
    items: capabilities,
    normalizedQuery,
  }).map(({ sortName: _sortName, ...capability }) => capability);
}

export const InputBarSlashSuggestionDropdown = forwardRef<
  SlashCommandDropdownRef,
  Pick<
    SuggestionProps<InputBarSlashSuggestionCapability>,
    "clientRect" | "command" | "query"
  > & {
    onClose: () => void;
    onDetailsRef?: RefObject<
      ((capability: InputBarSlashSuggestionCapability) => void) | undefined
    >;
    owner: LightWorkspaceType;
    selectedMCPServerViewIdsRef: RefObject<Set<string>>;
  }
>(
  (
    {
      clientRect,
      command,
      query,
      onClose,
      onDetailsRef,
      owner,
      selectedMCPServerViewIdsRef,
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
    });
    const { serverViews, isLoading: isServerViewsLoading } =
      useMCPServerViewsFromSpaces(owner, globalSpaces, { disabled: !isOpen });

    const filteredCapabilities = useMemo(
      () =>
        filterInputBarSlashSuggestions({
          query,
          selectedMCPServerViewIds:
            selectedMCPServerViewIdsRef.current ?? new Set<string>(),
          serverViews,
          skills,
        }),
      [query, selectedMCPServerViewIdsRef, serverViews, skills]
    );

    const capabilityItems = useMemo<SlashCommand[]>(
      () =>
        filteredCapabilities.flatMap((capability) => {
          switch (capability.kind) {
            case "skill":
              return [getSkillSlashCommandItem(capability.skill)];
            case "tool":
              return [getToolSlashCommandItem(capability.serverView)];
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
        key={
          isSkillsLoading && isSpacesLoading && isServerViewsLoading
            ? "loading"
            : "loaded"
        }
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
        listMaxHeightClassName={LIST_MAX_HEIGHT_CLASS_NAME}
        onClose={onClose}
        onItemDetails={
          onDetailsRef
            ? (item) => {
                const capability = filteredCapabilities.find((capability) =>
                  capability.kind === "skill"
                    ? capability.skill.sId === item.id
                    : capability.serverView.sId === item.id
                );

                if (!capability) {
                  return;
                }

                onDetailsRef.current?.(capability);
                onClose();
              }
            : undefined
        }
        showScrollFade
        size="wide"
      />
    );
  }
);

InputBarSlashSuggestionDropdown.displayName = "InputBarSlashSuggestionDropdown";
