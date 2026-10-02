import {
  INPUT_BAR_PILL_HOVER_CLASSNAME,
  INPUT_BAR_PILL_SURFACE_CLASSNAME,
} from "@app/components/assistant/conversation/input_bar/inputBarPillStyles";
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
import type { ContextSlashSearchSelection } from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import { PickModelSubMenuDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/PickModelSubMenuDropdown";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { SlashMenuStackFrame } from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import {
  ATTACH_CONTEXT_SUB_MENU_ID,
  getSlashCommandSubMenuId,
  PICK_MODEL_SUB_MENU_ID,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { useInputBarSlashCommandCapabilities } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashCommandCapabilities";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, cn, DropdownMenuSearchbar, Plus } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/core";
import type React from "react";
import type { RefObject } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

const ATTACH_ONLY_FILES_SECTION_LABEL = "Files";

// The same refs the "/" menu reads, so both menus offer the same entries and act alike.
export interface InputBarPlusMenuSlashMenu {
  conversationIdRef: RefObject<string | null>;
  editorRef: RefObject<Editor | null>;
  includeAttachKnowledgeRef: RefObject<boolean>;
  includePickModelRef: RefObject<boolean>;
  includeSelectSpacesRef: RefObject<boolean>;
  onDetailsRef: RefObject<((item: SlashCommand) => void) | undefined>;
  onModelSelectRef: RefObject<((selection: Selection) => void) | undefined>;
  onNodeSelectRef: RefObject<
    ((node: DataSourceViewContentNode) => void) | undefined
  >;
  onSelectRef: RefObject<((item: SlashCommand) => void) | undefined>;
  slashCommandsRef: RefObject<InputBarSlashCommand[]>;
  slashMenuModeRef: RefObject<InputBarSlashMenuMode | null>;
  spaceIdRef: RefObject<string | null | undefined>;
}

interface InputBarPlusMenuProps {
  buttonSize: "xs" | "sm";
  disabled: boolean;
  onOpenChange?: (open: boolean) => void;
  owner: LightWorkspaceType;
  slashMenu: InputBarPlusMenuSlashMenu;
}

export function InputBarPlusMenu({
  buttonSize,
  disabled,
  onOpenChange,
  owner,
  slashMenu,
}: InputBarPlusMenuProps) {
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
          disabled={disabled}
          isRounded
          tooltip="More"
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

function InputBarPlusMenuContent({
  anchorRef,
  onClose,
  owner,
  slashMenu,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  owner: LightWorkspaceType;
  slashMenu: InputBarPlusMenuSlashMenu;
}) {
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

  const { capabilityItems, isLoading, resolvedQuery } =
    useInputBarSlashCommandCapabilities({
      disabled: isAttachOnly,
      owner,
      query: activeFrame ? "" : query,
    });

  const sections = useMemo(
    () =>
      buildSlashCommandSections({
        commandItems: filterInputBarSlashCommandItems(
          allCommandItems,
          resolvedQuery
        ),
        capabilityItems,
      }),
    [allCommandItems, capabilityItems, resolvedQuery]
  );

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
      if (!subMenuRef.current?.navigateUp?.() && activeFrame) {
        enterFrame(null);
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
    ? "Search knowledge"
    : isPickModel
      ? "Search models"
      : "Search commands, skills, or tools";

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

  if (isAttachOnly) {
    // As in the "/" menu, the browser is the whole menu and the file upload rides at its root.
    const uploadItems = allCommandItems.filter(
      (item) =>
        isRunCommandSlashCommand<InputBarSlashCommand>(item) &&
        item.data.command.id === "upload-file"
    );
    return (
      <AttachContextSubMenuDropdown
        ref={subMenuRef}
        clientRect={clientRect}
        conversationId={conversationIdRef.current ?? null}
        dropdownHeaders={searchbar}
        onClose={onClose}
        onRootSectionSelect={handleCommand}
        onSelect={handleAttachContextSelect}
        owner={owner}
        query={query}
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
        conversationId={conversationIdRef.current ?? null}
        dropdownHeaders={searchbar}
        onBack={() => enterFrame(null)}
        onClose={onClose}
        onSelect={handleAttachContextSelect}
        owner={owner}
        query={query}
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
        dropdownHeaders={searchbar}
        onBack={() => enterFrame(null)}
        onClose={onClose}
        onSelect={handleModelSelect}
        owner={owner}
        query={query}
      />
    );
  }

  return (
    <SlashCommandDropdown
      ref={dropdownRef}
      sections={sections}
      command={handleCommand}
      clientRect={clientRect}
      dropdownHeaders={searchbar}
      emptyMessage="No commands found"
      isLoading={isLoading}
      onClose={onClose}
      onItemDetails={(item) => {
        onClose();
        onDetailsRef.current?.(item);
      }}
      size="wide"
    />
  );
}
