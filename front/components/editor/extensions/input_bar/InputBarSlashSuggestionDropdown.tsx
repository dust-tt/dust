import {
  filterInputBarSlashCommandItems,
  getInputBarSlashCommandItems,
} from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionItems";
import type {
  InputBarSlashCommand,
  InputBarSlashMenuMode,
} from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import { isRunCommandSlashCommand } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
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

const ATTACH_ONLY_FILES_SECTION_LABEL = "Files";

/**
 * @cc [owner:smb2268,label:product] attach-only-menu-is-locked
 * In the `attach-only` mode the dropdown MUST render the knowledge browser as the whole menu, with
 * the text after "/" as its query: no command list, no Back row, no capabilities fetched, and
 * Escape or Backspace at the browser's root closing the menu. The composer's "Upload file" command,
 * when it has one, MUST be offered as the last section of the browser's root, after the spaces, so
 * the first space stays the default highlight. The `commands` mode is unchanged.
 */
export const InputBarSlashSuggestionDropdown = forwardRef<
  SlashCommandDropdownRef,
  Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "command" | "editor" | "query" | "range"
  > & {
    conversationIdRef?: RefObject<string | null>;
    includeAttachKnowledgeRef: RefObject<boolean>;
    includePickModelRef: RefObject<boolean>;
    includeSelectSpacesRef: RefObject<boolean>;
    onClose: () => void;
    onDetailsRef?: RefObject<((item: SlashCommand) => void) | undefined>;
    onModelSelectRef: RefObject<((selection: Selection) => void) | undefined>;
    onNodeSelectRef: RefObject<
      ((node: DataSourceViewContentNode) => void) | undefined
    >;
    owner: LightWorkspaceType;
    slashCommandsRef: RefObject<InputBarSlashCommand[]>;
    slashMenuModeRef: RefObject<InputBarSlashMenuMode | null>;
    spaceIdRef: RefObject<string | null | undefined>;
  }
>(
  (
    {
      clientRect,
      command,
      conversationIdRef,
      editor,
      includeAttachKnowledgeRef,
      includePickModelRef,
      includeSelectSpacesRef,
      onClose,
      onDetailsRef,
      onModelSelectRef,
      onNodeSelectRef,
      owner,
      query,
      range,
      slashCommandsRef,
      slashMenuModeRef,
      spaceIdRef,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const subMenuRef = useRef<SlashCommandDropdownRef>(null);
    const isAttachOnly = slashMenuModeRef.current === "attach-only";
    const {
      activeFrame: stackFrame,
      pop,
      storage,
    } = useSlashMenuStack(editor, "inputBarSlashSuggestion");

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
          includeSelectSpaces: includeSelectSpacesRef.current ?? false,
        }),
      [
        includeAttachKnowledgeRef,
        includePickModelRef,
        includeSelectSpacesRef,
        slashCommandsRef,
      ]
    );

    // "/model fab" opens the model sub-menu with "fab" as its query without pushing a frame.
    // Back then relies on `pop` deleting the text after "/", not on the (empty) stack.
    const queryFrame = useMemo(
      () =>
        stackFrame || isAttachOnly
          ? null
          : resolveSlashSubMenuFromQuery({
              commandItems: allCommandItems,
              query,
            }),
      [allCommandItems, isAttachOnly, query, stackFrame]
    );
    const activeFrame = stackFrame ?? queryFrame?.frame ?? null;
    const subMenuQuery = queryFrame?.query ?? query;

    const { capabilityItems, isLoading, resolvedQuery } =
      useInputBarSlashCommandCapabilities({
        disabled: isAttachOnly,
        owner,
        query,
      });

    const commandItems = useMemo(
      () => filterInputBarSlashCommandItems(allCommandItems, resolvedQuery),
      [allCommandItems, resolvedQuery]
    );

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
          if (isAttachOnly) {
            return subMenuRef.current?.onKeyDown({ event }) ?? false;
          }

          if (
            activeFrame?.subMenuId === ATTACH_CONTEXT_SUB_MENU_ID ||
            activeFrame?.subMenuId === PICK_MODEL_SUB_MENU_ID
          ) {
            // The command text is still in the editor: Backspace edits it, except that with an
            // empty sub-menu query below the browser's root it goes up a level, as from the stack.
            if (queryFrame && event.key === "Backspace") {
              if (
                subMenuQuery.trim().length === 0 &&
                subMenuRef.current?.navigateUp?.()
              ) {
                event.preventDefault();
                return true;
              }
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
      [
        activeFrame?.subMenuId,
        flatItems.length,
        isAttachOnly,
        onClose,
        query,
        queryFrame,
        subMenuQuery,
      ]
    );

    if (isAttachOnly) {
      // The browser is the whole menu, so the file upload command rides along at its root.
      const uploadItems = allCommandItems.filter(
        (item) =>
          isRunCommandSlashCommand<InputBarSlashCommand>(item) &&
          item.data.command.id === "upload-file"
      );
      return (
        <AttachContextSubMenuDropdown
          ref={subMenuRef}
          clientRect={clientRect}
          conversationId={conversationIdRef?.current ?? null}
          editor={editor}
          onClose={onClose}
          onRootSectionSelect={command}
          onSelect={handleAttachContextSelect}
          owner={owner}
          query={query}
          range={range}
          rootSection={
            uploadItems.length > 0
              ? { label: ATTACH_ONLY_FILES_SECTION_LABEL, items: uploadItems }
              : undefined
          }
          spaceId={spaceIdRef.current ?? null}
          useCase="conversation-input"
        />
      );
    }

    if (activeFrame?.subMenuId === ATTACH_CONTEXT_SUB_MENU_ID) {
      return (
        <AttachContextSubMenuDropdown
          ref={subMenuRef}
          activeFrame={activeFrame}
          clientRect={clientRect}
          conversationId={conversationIdRef?.current ?? null}
          editor={editor}
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
