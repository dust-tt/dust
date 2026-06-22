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
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { ResourceAvatar } from "@app/components/resources/resources_icons";
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
import {
  INPUT_BAR_SLASH_COMMANDS,
  type InputBarSlashCommand,
  type InputBarSlashSuggestionCapability,
  isInputBarSlashSuggestionCapability,
} from "./InputBarSlashSuggestionTypes";

// Rare case where we need a Tailwind arbitrary value: after the fixed search bar, the scrollable list should fit
// exactly seven 3.25rem rows without showing a partial row or leaving extra bottom space.
const LIST_MAX_HEIGHT_CLASS_NAME = "max-h-[22.75rem]";

export function filterInputBarSlashSuggestions({
  commands,
  query,
  selectedMCPServerViewIds,
  serverViews,
  skills,
}: {
  commands: InputBarSlashCommand[];
  query: string;
  selectedMCPServerViewIds: Set<string>;
  serverViews: MCPServerViewType[];
  skills: SkillWithoutInstructionsAndToolsType[];
}): InputBarSlashSuggestionCapability[] {
  const normalizedQuery = query.trim().toLowerCase();

  // Static commands form their own section ahead of capabilities; both are filtered by the query
  // but sorted independently so command relevance is never weighed against capability names.
  const commandMatches: (InputBarSlashSuggestionCapability & {
    sortName: string;
  })[] = commands
    .filter((command) =>
      matchesSlashCommandCapabilityQuery({
        label: command.label,
        query: normalizedQuery,
      })
    )
    .map((command) => ({
      kind: "command" as const,
      command,
      sortName: command.label.toLowerCase(),
    }));

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

  return [
    ...sortSlashCommandCapabilityMatches({
      items: commandMatches,
      normalizedQuery,
    }),
    ...sortSlashCommandCapabilityMatches({
      items: capabilities,
      normalizedQuery,
    }),
  ].map(({ sortName: _sortName, ...capability }) => capability);
}

export const InputBarSlashSuggestionDropdown = forwardRef<
  SlashCommandDropdownRef,
  Pick<
    SuggestionProps<InputBarSlashSuggestionCapability>,
    "clientRect" | "command" | "editor" | "query" | "range"
  > & {
    conversationIdRef?: RefObject<string | null>;
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
      conversationIdRef,
      editor,
      query,
      range,
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

    // Static commands operate on the current conversation, so they are only offered once one
    // exists.
    const hasConversation = Boolean(conversationIdRef?.current);

    const filteredCapabilities = useMemo(
      () =>
        filterInputBarSlashSuggestions({
          commands: hasConversation ? INPUT_BAR_SLASH_COMMANDS : [],
          query,
          selectedMCPServerViewIds:
            selectedMCPServerViewIdsRef.current ?? new Set<string>(),
          serverViews,
          skills,
        }),
      [hasConversation, query, selectedMCPServerViewIdsRef, serverViews, skills]
    );

    // Items carry their capability in `data` so selection and details handlers can recover it
    // without a reverse lookup. Ids are prefixed by kind to stay unique across capability kinds.
    const capabilityItems = useMemo<SlashCommand[]>(
      () =>
        filteredCapabilities.flatMap((capability): SlashCommand[] => {
          switch (capability.kind) {
            case "command":
              return [
                {
                  action: "run-command",
                  data: capability,
                  description: capability.command.description,
                  icon: () => (
                    <ResourceAvatar icon={capability.command.icon} size="sm" />
                  ),
                  id: `command-${capability.command.id}`,
                  label: capability.command.label,
                },
              ];
            case "skill":
              return [
                {
                  ...getSkillSlashCommandItem(capability.skill),
                  data: capability,
                  id: `skill-${capability.skill.sId}`,
                },
              ];
            case "tool":
              return [
                {
                  ...getToolSlashCommandItem(capability.serverView),
                  data: capability,
                  id: `tool-${capability.serverView.sId}`,
                },
              ];
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
          // Static commands are shown while capabilities load, so selection is only blocked when
          // the list has nothing to select.
          if (
            (event.key === "Enter" || event.key === "Tab") &&
            capabilityItems.length === 0
          ) {
            event.preventDefault();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [capabilityItems.length]
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
          if (isInputBarSlashSuggestionCapability(item.data)) {
            command(item.data);
          }
        }}
        clientRect={clientRect}
        emptyMessage={
          isCapabilitiesLoading ? "Loading capabilities…" : "No matches found"
        }
        listMaxHeightClassName={LIST_MAX_HEIGHT_CLASS_NAME}
        onClose={onClose}
        onItemDetails={
          onDetailsRef
            ? (item) => {
                if (!isInputBarSlashSuggestionCapability(item.data)) {
                  return;
                }

                editor.chain().focus().deleteRange(range).run();
                onDetailsRef.current?.(item.data);
                onClose();
              }
            : undefined
        }
        size="wide"
      />
    );
  }
);

InputBarSlashSuggestionDropdown.displayName = "InputBarSlashSuggestionDropdown";
