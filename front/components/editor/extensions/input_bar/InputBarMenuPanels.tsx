import type { InputBarSlashMenuRootSection } from "@app/components/editor/extensions/input_bar/useInputBarSlashMenuSections";
import { AttachContextSubMenuDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/AttachContextSubMenuDropdown";
import { PickModelSubMenuDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/PickModelSubMenuDropdown";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { SlashCommandSection } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type { ContextSlashSearchSelection } from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import type { SlashMenuStackFrame } from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import {
  ATTACH_CONTEXT_SUB_MENU_ID,
  PICK_MODEL_SUB_MENU_ID,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import type { LightWorkspaceType } from "@app/types/user";
import type { SuggestionProps } from "@tiptap/suggestion";
import type React from "react";
import type { RefObject } from "react";

interface InputBarMenuPanelsProps extends Pick<
  SuggestionProps<SlashCommand>,
  "clientRect"
> {
  // The open sub-menu, if any. Ignored in `attach-only` mode where the browser is the whole menu.
  activeFrame: SlashMenuStackFrame | null;
  attachOnlyRootSection: InputBarSlashMenuRootSection | undefined;
  conversationId: string | null;
  // Rendered above the list of whichever panel is open, e.g. the "+" menu's searchbar.
  dropdownHeaders?: React.ReactNode;
  // The root list's handle, for the owner's keyboard routing.
  dropdownRef: RefObject<SlashCommandDropdownRef>;
  isAttachOnly: boolean;
  isLoading: boolean;
  onAttachContextSelect: (selection: ContextSlashSearchSelection) => void;
  onBack: () => void;
  onClose: () => void;
  onCommand: (item: SlashCommand) => void;
  onItemDetails?: (item: SlashCommand) => void;
  onModelSelect: (selection: Selection) => void;
  owner: LightWorkspaceType;
  // The query of the open sub-menu or of the attach-only browser. The root list's query is already
  // applied to `sections`.
  query: string;
  sections: SlashCommandSection[];
  spaceId: string | null;
  // The sub-menu's or attach-only browser's handle, for the owner's keyboard routing.
  subMenuRef: RefObject<SlashCommandDropdownRef>;
}

export function InputBarMenuPanels({
  activeFrame,
  attachOnlyRootSection,
  clientRect,
  conversationId,
  dropdownHeaders,
  dropdownRef,
  isAttachOnly,
  isLoading,
  onAttachContextSelect,
  onBack,
  onClose,
  onCommand,
  onItemDetails,
  onModelSelect,
  owner,
  query,
  sections,
  spaceId,
  subMenuRef,
}: InputBarMenuPanelsProps) {
  if (isAttachOnly) {
    return (
      <AttachContextSubMenuDropdown
        ref={subMenuRef}
        clientRect={clientRect}
        conversationId={conversationId}
        dropdownHeaders={dropdownHeaders}
        onClose={onClose}
        onRootSectionSelect={onCommand}
        onSelect={onAttachContextSelect}
        owner={owner}
        query={query}
        rootSection={attachOnlyRootSection}
        spaceId={spaceId}
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
        conversationId={conversationId}
        dropdownHeaders={dropdownHeaders}
        onBack={onBack}
        onClose={onClose}
        onSelect={onAttachContextSelect}
        owner={owner}
        query={query}
        spaceId={spaceId}
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
        dropdownHeaders={dropdownHeaders}
        onBack={onBack}
        onClose={onClose}
        onSelect={onModelSelect}
        owner={owner}
        query={query}
      />
    );
  }

  return (
    <SlashCommandDropdown
      ref={dropdownRef}
      sections={sections}
      command={onCommand}
      clientRect={clientRect}
      dropdownHeaders={dropdownHeaders}
      emptyMessage="No commands found"
      isLoading={isLoading}
      onClose={onClose}
      onItemDetails={onItemDetails}
      size="wide"
    />
  );
}
