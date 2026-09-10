import {
  filterInputBarSlashCommandItems,
  getInputBarSlashCommandItems,
} from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionItems";
import type { InputBarSlashCommand } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import { AttachContextSubMenuDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/AttachContextSubMenuDropdown";
import { applyAttachContextSelection } from "@app/components/editor/extensions/shared/slash_suggestion/applyAttachContextSelection";
import { buildSlashCommandSections } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import { PickModelSubMenuDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/PickModelSubMenuDropdown";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import {
  ATTACH_CONTEXT_SUB_MENU_ID,
  clearSlashSubMenuStack,
  PICK_MODEL_SUB_MENU_ID,
  resolveSlashSubMenuFromQuery,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { SLASH_COMMAND_CAPABILITIES_LOADING_MESSAGE } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import { useInputBarSlashCommandCapabilities } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashCommandCapabilities";
import { useSlashMenuStack } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashMenuStack";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import type { SuggestionProps } from "@tiptap/suggestion";
import type { RefObject } from "react";
import {
  forwardRef,
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
    includeAttachKnowledgeRef: RefObject<boolean>;
    includePickModelRef: RefObject<boolean>;
    onClose: () => void;
    onDetailsRef?: RefObject<((item: SlashCommand) => void) | undefined>;
    onModelSelectRef: RefObject<((selection: Selection) => void) | undefined>;
    onNodeSelectRef: RefObject<
      ((node: DataSourceViewContentNode) => void) | undefined
    >;
    owner: LightWorkspaceType;
    selectedMCPServerViewIdsRef: RefObject<Set<string>>;
    slashCommandsRef: RefObject<InputBarSlashCommand[]>;
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
      includeAttachKnowledgeRef,
      includePickModelRef,
      onClose,
      onDetailsRef,
      onModelSelectRef,
      onNodeSelectRef,
      owner,
      query,
      range,
      selectedMCPServerViewIdsRef,
      slashCommandsRef,
      spaceIdRef,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const subMenuRef = useRef<SlashCommandDropdownRef>(null);
    const {
      activeFrame: stackFrame,
      pop,
      storage,
    } = useSlashMenuStack(editor, "inputBarSlashSuggestion");

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

    const handleModelSelect = useCallback(
      (selection: Selection) => {
        clearSlashSubMenuStack(storage);
        editor.chain().focus().deleteRange(range).run();
        onModelSelectRef.current?.(selection);
        onClose();
      },
      [editor, onClose, onModelSelectRef, range, storage]
    );

    const allCommandItems = useMemo(
      () =>
        getInputBarSlashCommandItems({
          commands: slashCommandsRef.current ?? [],
          includeAttachKnowledge: includeAttachKnowledgeRef.current ?? false,
          includePickModel: includePickModelRef.current ?? false,
        }),
      [includeAttachKnowledgeRef, includePickModelRef, slashCommandsRef]
    );

    const commandItems = useMemo(
      () => filterInputBarSlashCommandItems(allCommandItems, query),
      [allCommandItems, query]
    );

    // "/model fab" opens the model sub-menu with "fab" as its query without pushing a frame.
    // Back then relies on `pop` deleting the text after "/", not on the (empty) stack.
    const queryFrame = useMemo(
      () =>
        stackFrame
          ? null
          : resolveSlashSubMenuFromQuery({
              commandItems: allCommandItems,
              query,
            }),
      [allCommandItems, query, stackFrame]
    );
    const activeFrame = stackFrame ?? queryFrame?.frame ?? null;
    const subMenuQuery = queryFrame?.query ?? query;

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
          if (
            activeFrame?.subMenuId === ATTACH_CONTEXT_SUB_MENU_ID ||
            activeFrame?.subMenuId === PICK_MODEL_SUB_MENU_ID
          ) {
            // The command text is still in the editor: let Backspace edit it.
            if (queryFrame && event.key === "Backspace") {
              return false;
            }

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
      [activeFrame?.subMenuId, flatItems.length, onClose, query, queryFrame]
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
          query={subMenuQuery}
          range={range}
          spaceId={spaceIdRef.current ?? null}
          useCase="conversation-input"
        />
      );
    }

    if (activeFrame?.subMenuId === PICK_MODEL_SUB_MENU_ID) {
      return (
        <PickModelSubMenuDropdown
          ref={subMenuRef}
          activeFrame={activeFrame}
          clientRect={clientRect}
          editor={editor}
          onBack={() => pop(range)}
          onClose={onClose}
          onSelect={handleModelSelect}
          owner={owner}
          query={subMenuQuery}
          range={range}
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
