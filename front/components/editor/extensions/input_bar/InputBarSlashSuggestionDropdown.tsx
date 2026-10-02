import { InputBarMenuPanels } from "@app/components/editor/extensions/input_bar/InputBarMenuPanels";
import type { InputBarSlashMenuRefs } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import { useInputBarSlashMenuSections } from "@app/components/editor/extensions/input_bar/useInputBarSlashMenuSections";
import { applyAttachContextSelection } from "@app/components/editor/extensions/shared/slash_suggestion/applyAttachContextSelection";
import { flattenSlashCommandSections } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type { ContextSlashSearchSelection } from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import {
  ATTACH_CONTEXT_SUB_MENU_ID,
  clearSlashSubMenuStack,
  PICK_MODEL_SUB_MENU_ID,
  resolveSlashSubMenuFromQuery,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { useSlashMenuStack } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashMenuStack";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import type { LightWorkspaceType } from "@app/types/user";
import type { SuggestionProps } from "@tiptap/suggestion";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

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
  > &
    InputBarSlashMenuRefs & {
      onClose: () => void;
      owner: LightWorkspaceType;
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
      (selection: ContextSlashSearchSelection) => {
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

    const { allCommandItems, attachOnlyRootSection, isLoading, sections } =
      useInputBarSlashMenuSections({
        includeAttachKnowledgeRef,
        includePickModelRef,
        includeSelectSpacesRef,
        isAttachOnly,
        owner,
        query,
        slashCommandsRef,
      });

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

    const flatItemCount = useMemo(
      () => flattenSlashCommandSections(sections).length,
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
            flatItemCount === 0
          ) {
            event.preventDefault();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [
        activeFrame?.subMenuId,
        flatItemCount,
        isAttachOnly,
        onClose,
        query,
        queryFrame,
        subMenuQuery,
      ]
    );

    return (
      <InputBarMenuPanels
        activeFrame={activeFrame}
        attachOnlyRootSection={attachOnlyRootSection}
        clientRect={clientRect}
        conversationId={conversationIdRef?.current ?? null}
        dropdownRef={dropdownRef}
        isAttachOnly={isAttachOnly}
        isLoading={isLoading}
        onAttachContextSelect={handleAttachContextSelect}
        onBack={() => pop(range)}
        onClose={onClose}
        onCommand={command}
        onItemDetails={
          onDetailsRef
            ? (item) => {
                editor.chain().focus().deleteRange(range).run();
                onDetailsRef.current?.(item);
                onClose();
              }
            : undefined
        }
        onModelSelect={handleModelSelect}
        owner={owner}
        query={subMenuQuery}
        sections={sections}
        spaceId={spaceIdRef.current ?? null}
        subMenuRef={subMenuRef}
      />
    );
  }
);

InputBarSlashSuggestionDropdown.displayName = "InputBarSlashSuggestionDropdown";
