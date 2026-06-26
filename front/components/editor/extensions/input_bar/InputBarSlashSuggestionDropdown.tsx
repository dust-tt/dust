import { buildInputBarSlashCommandItems } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionItems";
import type { InputBarSlashCommand } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import { AttachContextSubMenuDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/AttachContextSubMenuDropdown";
import { applyAttachContextSelection } from "@app/components/editor/extensions/shared/slash_suggestion/applyAttachContextSelection";
import { buildSlashCommandSections } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import {
  ATTACH_CONTEXT_SUB_MENU_ID,
  clearSlashSubMenuStack,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { SLASH_COMMAND_CAPABILITIES_LOADING_MESSAGE } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import { useInputBarSlashCommandCapabilities } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashCommandCapabilities";
import { useSlashMenuStack } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashMenuStack";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import type { SuggestionProps } from "@tiptap/suggestion";
import {
  forwardRef,
  type RefObject,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

export const InputBarSlashSuggestionDropdown = forwardRef<
  SlashCommandDropdownRef,
  Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "command" | "editor" | "query" | "range"
  > & {
    attachedNodesRef: RefObject<DataSourceViewContentNode[]>;
    conversationIdRef?: RefObject<string | null>;
    onClose: () => void;
    onDetailsRef?: RefObject<((item: SlashCommand) => void) | undefined>;
    onNodeSelectRef: RefObject<
      ((node: DataSourceViewContentNode) => void) | undefined
    >;
    owner: LightWorkspaceType;
    selectedMCPServerViewIdsRef: RefObject<Set<string>>;
    slashCommandsRef: RefObject<InputBarSlashCommand[]>;
    includeAttachKnowledgeRef: RefObject<boolean>;
    spaceIdRef: RefObject<string | null | undefined>;
  }
>(
  (
    {
      attachedNodesRef,
      clientRect,
      command,
      conversationIdRef,
      editor,
      onClose,
      onDetailsRef,
      onNodeSelectRef,
      owner,
      query,
      range,
      selectedMCPServerViewIdsRef,
      slashCommandsRef,
      includeAttachKnowledgeRef,
      spaceIdRef,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const subMenuRef = useRef<SlashCommandDropdownRef>(null);
    const { activeFrame, pop, storage } = useSlashMenuStack(
      editor,
      "inputBarSlashSuggestion"
    );

    const isNodeAttached = useCallback(
      (node: DataSourceViewContentNode) => {
        const attachedNodes = attachedNodesRef.current ?? [];

        return attachedNodes.some(
          (attachedNode) =>
            attachedNode.internalId === node.internalId &&
            attachedNode.dataSourceView.dataSource.sId ===
              node.dataSourceView.dataSource.sId
        );
      },
      [attachedNodesRef]
    );

    const handleAttachContextSelect = useCallback(
      (
        selection: Parameters<
          typeof applyAttachContextSelection
        >[0]["selection"]
      ) => {
        clearSlashSubMenuStack(storage);
        applyAttachContextSelection({
          editor,
          onKnowledgeSelect: onNodeSelectRef.current ?? undefined,
          range,
          selection,
          useCase: "conversation-input",
        });
        onClose();
      },
      [editor, onClose, onNodeSelectRef, range, storage]
    );

    const commandItems = useMemo(
      () =>
        buildInputBarSlashCommandItems({
          commands: slashCommandsRef.current ?? [],
          includeAttachKnowledge: includeAttachKnowledgeRef.current ?? false,
          query,
        }),
      [includeAttachKnowledgeRef, query, slashCommandsRef]
    );

    const { capabilityItems, isLoading } = useInputBarSlashCommandCapabilities({
      owner,
      query,
      selectedMCPServerViewIdsRef,
    });

    const sections = useMemo(
      () =>
        buildSlashCommandSections({
          commandItems,
          capabilityItems,
        }),
      [capabilityItems, commandItems]
    );

    const flatItems = useMemo(
      () => sections.flatMap((section) => section.items),
      [sections]
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (activeFrame?.subMenuId === ATTACH_CONTEXT_SUB_MENU_ID) {
            return subMenuRef.current?.onKeyDown({ event }) ?? false;
          }

          if (event.key === "Backspace" && query.trim().length === 0) {
            event.preventDefault();
            onClose();
            return true;
          }

          if (
            (event.key === "Enter" || event.key === "Tab") &&
            flatItems.length === 0
          ) {
            event.preventDefault();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [activeFrame?.subMenuId, flatItems.length, onClose, query]
    );

    if (activeFrame?.subMenuId === ATTACH_CONTEXT_SUB_MENU_ID) {
      return (
        <AttachContextSubMenuDropdown
          ref={subMenuRef}
          activeFrame={activeFrame}
          clientRect={clientRect}
          conversationId={conversationIdRef?.current ?? null}
          editor={editor}
          isNodeAttached={isNodeAttached}
          onBack={() => pop(range)}
          onClose={onClose}
          onSelect={handleAttachContextSelect}
          owner={owner}
          query={query}
          range={range}
          spaceId={spaceIdRef.current ?? null}
          useCase="conversation-input"
        />
      );
    }

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        sections={sections}
        command={command}
        clientRect={clientRect}
        emptyMessage="No commands found"
        isLoading={isLoading}
        loadingMessage={SLASH_COMMAND_CAPABILITIES_LOADING_MESSAGE}
        onClose={onClose}
        onItemDetails={
          onDetailsRef
            ? (item) => {
                editor.chain().focus().deleteRange(range).run();
                onDetailsRef.current?.(item);
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
