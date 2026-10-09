import {
  INPUT_BAR_PILL_HOVER_CLASSNAME,
  INPUT_BAR_PILL_SURFACE_CLASSNAME,
} from "@app/components/assistant/conversation/input_bar/inputBarPillStyles";
import { InputBarMenuPanels } from "@app/components/editor/extensions/input_bar/InputBarMenuPanels";
import type { InputBarSlashMenuRefs } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import { useInputBarSlashMenuSections } from "@app/components/editor/extensions/input_bar/useInputBarSlashMenuSections";
import { applyAttachContextSelection } from "@app/components/editor/extensions/shared/slash_suggestion/applyAttachContextSelection";
import type { ContextSlashSearchSelection } from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { SlashMenuStackFrame } from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import {
  ATTACH_CONTEXT_SUB_MENU_ID,
  getSlashCommandSubMenuId,
  PICK_MODEL_SUB_MENU_ID,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, cn, DropdownMenuSearchbar, Plus } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/core";
import type React from "react";
import type { RefObject } from "react";
import { useCallback, useRef, useState } from "react";

// The same refs the "/" menu reads, so both menus offer the same entries and act alike, plus the
// editor the knowledge browser inserts into.
export type InputBarPlusMenuSlashMenu = InputBarSlashMenuRefs & {
  editorRef: RefObject<Editor | null>;
};

interface InputBarPlusMenuProps {
  buttonSize: "xs" | "sm";
  onOpenChange?: (open: boolean) => void;
  owner: LightWorkspaceType;
  slashMenu: InputBarPlusMenuSlashMenu;
}

export function InputBarPlusMenu({
  buttonSize,
  onOpenChange,
  owner,
  slashMenu,
}: InputBarPlusMenuProps) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const setOpen = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  };

  return (
    <>
      <div ref={anchorRef} className="flex items-center">
        <Button
          variant="ghost-secondary"
          icon={Plus}
          size={buttonSize}
          isRounded
          tooltip={t`More`}
          className={cn(
            INPUT_BAR_PILL_SURFACE_CLASSNAME,
            INPUT_BAR_PILL_HOVER_CLASSNAME
          )}
          onClick={() => setOpen(!isOpen)}
        />
      </div>
      {isOpen && (
        <InputBarPlusMenuContent
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
          owner={owner}
          slashMenu={slashMenu}
        />
      )}
    </>
  );
}

interface InputBarPlusMenuContentProps {
  anchorRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  owner: LightWorkspaceType;
  slashMenu: InputBarPlusMenuSlashMenu;
}

function InputBarPlusMenuContent({
  anchorRef,
  onClose,
  owner,
  slashMenu,
}: InputBarPlusMenuContentProps) {
  const { t } = useLingui();
  const {
    conversationIdRef,
    editorRef,
    includeAttachKnowledgeRef,
    includePickModelRef,
    includeSelectSpacesRef,
    onDetailsRef,
    onModelSelectRef,
    onNodeSelectRef,
    onSelectRef,
    slashCommandsRef,
    slashMenuModeRef,
    spaceIdRef,
  } = slashMenu;
  const [query, setQuery] = useState("");
  const [activeFrame, setActiveFrame] = useState<SlashMenuStackFrame | null>(
    null
  );
  const dropdownRef = useRef<SlashCommandDropdownRef>(null);
  const subMenuRef = useRef<SlashCommandDropdownRef>(null);
  const isAttachOnly = slashMenuModeRef.current === "attach-only";

  const clientRect = useCallback(
    () => anchorRef.current?.getBoundingClientRect() ?? null,
    [anchorRef]
  );

  const { attachOnlyRootSection, isLoading, sections } =
    useInputBarSlashMenuSections({
      includeAttachKnowledgeRef,
      includePickModelRef,
      includeSelectSpacesRef,
      isAttachOnly,
      owner,
      query: activeFrame ? "" : query,
      slashCommandsRef,
    });

  const enterFrame = (frame: SlashMenuStackFrame | null) => {
    setActiveFrame(frame);
    setQuery("");
  };

  const handleCommand = (item: SlashCommand) => {
    const subMenuId = getSlashCommandSubMenuId(item);
    if (subMenuId) {
      enterFrame({ command: item, subMenuId });
      return;
    }

    onClose();
    onSelectRef.current?.(item);
  };

  const handleAttachContextSelect = (
    selection: ContextSlashSearchSelection
  ) => {
    onClose();
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const { from, to } = editor.state.selection;
    applyAttachContextSelection({
      editor,
      onKnowledgeSelect: onNodeSelectRef.current ?? undefined,
      range: { from, to },
      selection,
      useCase: "conversation-input",
    });
  };

  const handleModelSelect = (selection: Selection) => {
    onClose();
    onModelSelectRef.current?.(selection);
  };

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    // Escape reaches the menu's dismiss layer first, which goes back or closes.
    if (event.nativeEvent.isComposing || event.key === "Escape") {
      return;
    }

    if (event.key === "Backspace") {
      if (query.length > 0) {
        return;
      }
      event.preventDefault();
      if (subMenuRef.current?.navigateUp?.()) {
        return;
      }
      if (activeFrame) {
        enterFrame(null);
        return;
      }
      if (isAttachOnly) {
        onClose();
      }
      return;
    }

    const activeRef = activeFrame || isAttachOnly ? subMenuRef : dropdownRef;
    if (activeRef.current?.onKeyDown({ event: event.nativeEvent })) {
      event.preventDefault();
    }
  };

  const isAttachContext =
    isAttachOnly || activeFrame?.subMenuId === ATTACH_CONTEXT_SUB_MENU_ID;
  const isPickModel = activeFrame?.subMenuId === PICK_MODEL_SUB_MENU_ID;
  const searchPlaceholder = isAttachContext
    ? t`Search knowledge`
    : isPickModel
      ? t`Search models`
      : t`Search commands, skills, or tools`;

  // Each level is its own dropdown, so the searchbar remounts with it and takes focus back.
  const searchbar = (
    <DropdownMenuSearchbar
      autoFocus
      name="input-bar-plus-menu-search"
      placeholder={searchPlaceholder}
      value={query}
      onChange={setQuery}
      onKeyDown={handleSearchKeyDown}
    />
  );

  return (
    <InputBarMenuPanels
      activeFrame={activeFrame}
      attachOnlyRootSection={attachOnlyRootSection}
      clientRect={clientRect}
      conversationId={conversationIdRef?.current ?? null}
      dropdownHeaders={searchbar}
      dropdownRef={dropdownRef}
      isAttachOnly={isAttachOnly}
      isLoading={isLoading}
      onAttachContextSelect={handleAttachContextSelect}
      onBack={() => enterFrame(null)}
      onClose={onClose}
      onCommand={handleCommand}
      onItemDetails={
        onDetailsRef
          ? (item) => {
              onClose();
              onDetailsRef.current?.(item);
            }
          : undefined
      }
      onModelSelect={handleModelSelect}
      owner={owner}
      query={query}
      sections={sections}
      spaceId={spaceIdRef.current ?? null}
      subMenuRef={subMenuRef}
    />
  );
}
