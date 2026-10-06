import {
  filterInputBarSlashCommandItems,
  getInputBarSlashCommandItems,
} from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionItems";
import type {
  InputBarSlashCommand,
  InputBarSlashMenuRefs,
} from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import type { SlashCommandSection } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import { buildSlashCommandSections } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { useInputBarSlashCommandCapabilities } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashCommandCapabilities";
import { isRunCommandSlashCommand } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

const ATTACH_ONLY_FILES_SECTION_LABEL = "Files";

export interface InputBarSlashMenuRootSection {
  label: string;
  items: SlashCommand[];
}

// The items of the "/" and "+" menus: the composer's static commands and the workspace capabilities
// matching `query`, grouped into the root list's sections. `query` is the root list's query; pass
// "" while a sub-menu is open so capabilities are not refetched for the sub-menu's search.
/**
 * @cc [owner:ykmsd,label:product] attach-only-root-section
 * When `isAttachOnly`, `attachOnlyRootSection` MUST hold exactly the composer's `upload-file`
 * command item under the "Files" label, and MUST be `undefined` when the composer has no such
 * command. It MUST be `undefined` outside `attach-only` mode, where "Upload file" is a row of the
 * root command list instead. In `attach-only` mode no capabilities MUST be fetched.
 */
export function useInputBarSlashMenuSections({
  includeAttachKnowledgeRef,
  includePickModelRef,
  includeSelectSpacesRef,
  isAttachOnly,
  owner,
  query,
  slashCommandsRef,
}: Pick<
  InputBarSlashMenuRefs,
  | "includeAttachKnowledgeRef"
  | "includePickModelRef"
  | "includeSelectSpacesRef"
  | "slashCommandsRef"
> & {
  isAttachOnly: boolean;
  owner: LightWorkspaceType;
  query: string;
}): {
  allCommandItems: SlashCommand[];
  attachOnlyRootSection: InputBarSlashMenuRootSection | undefined;
  isLoading: boolean;
  sections: SlashCommandSection[];
} {
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

  const { capabilityItems, isLoading } = useInputBarSlashCommandCapabilities({
    disabled: isAttachOnly,
    owner,
    query,
  });

  // Static commands follow the typed query; capabilities trail it by their search's debounce.
  const sections = useMemo(
    () =>
      buildSlashCommandSections({
        commandItems: filterInputBarSlashCommandItems(allCommandItems, query),
        capabilityItems,
      }),
    [allCommandItems, capabilityItems, query]
  );

  // The browser is the whole menu, so the file upload command rides along at its root.
  const attachOnlyRootSection = useMemo(() => {
    if (!isAttachOnly) {
      return undefined;
    }
    const uploadItems = allCommandItems.filter(
      (item) =>
        isRunCommandSlashCommand<InputBarSlashCommand>(item) &&
        item.data.command.id === "upload-file"
    );
    return uploadItems.length > 0
      ? { label: ATTACH_ONLY_FILES_SECTION_LABEL, items: uploadItems }
      : undefined;
  }, [allCommandItems, isAttachOnly]);

  return { allCommandItems, attachOnlyRootSection, isLoading, sections };
}
