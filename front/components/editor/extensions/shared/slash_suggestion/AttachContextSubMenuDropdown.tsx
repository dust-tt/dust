import { useBrowsableSpaces } from "@app/components/data_source_view/browser/useBrowsableSpaces";
import { useKnowledgeBrowserItems } from "@app/components/data_source_view/browser/useKnowledgeBrowserItems";
import { useKnowledgeBrowserNavigation } from "@app/components/data_source_view/browser/useKnowledgeBrowserNavigation";
import { AttachContextSlashMenuItemIcon } from "@app/components/editor/extensions/shared/slash_suggestion/AttachContextSlashMenuItemIcon";
import type { AttachContextSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/attachContextSlashCommand";
import {
  isAttachContextSlashCommand,
  SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION,
} from "@app/components/editor/extensions/shared/slash_suggestion/attachContextSlashCommand";
import type { SlashCommandSection } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type {
  ContextSlashSearchSelection,
  ContextSlashSearchUseCase,
} from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import {
  buildBrowseCommands,
  buildRootBrowseSections,
  getKnowledgeBrowserBreadcrumbItems,
  isLoadMoreKnowledgeBrowserSlashCommand,
  isNavigateKnowledgeBrowserSlashCommand,
  navigateToKnowledgeBrowserItem,
} from "@app/components/editor/extensions/shared/slash_suggestion/knowledgeBrowserSlashCommands";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { SlashMenuStackFrame } from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { useAttachContextSearchSections } from "@app/components/editor/extensions/shared/slash_suggestion/useAttachContextSearchSections";
import type { AttachContextSlashMenuItem } from "@app/components/editor/extensions/shared/slash_suggestion/useAttachContextSlashMenuItems";
import { useAttachContextSlashMenuItems } from "@app/components/editor/extensions/shared/slash_suggestion/useAttachContextSlashMenuItems";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import { Breadcrumbs } from "@dust-tt/sparkle";
import type { SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

export { SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/attachContextSlashCommand";

const BROWSE_EMPTY_MESSAGE = "Nothing to browse here";

function toSlashCommandItem(
  item: AttachContextSlashMenuItem
): AttachContextSlashCommand {
  return {
    action: SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION,
    data: { selection: item.selection },
    description: item.description,
    icon: () => <AttachContextSlashMenuItemIcon item={item} />,
    id: item.id,
    label: item.label,
  };
}

// What the list shows: the browsed level, the global search, or the scoped search plus the rest.
type SubMenuMode = "browse" | "search" | "scoped-search";

function getSubMenuMode({
  isBrowserEnabled,
  query,
  canNavigateUp,
}: {
  isBrowserEnabled: boolean;
  query: string;
  canNavigateUp: boolean;
}): SubMenuMode {
  if (!isBrowserEnabled) {
    return "search";
  }
  if (query.trim().length === 0) {
    return "browse";
  }
  return canNavigateUp ? "scoped-search" : "search";
}

type SubMenuListProps =
  | { items: SlashCommand[] }
  | { sections: SlashCommandSection[] };

function getSubMenuListProps({
  mode,
  isRoot,
  isBrowseLoading,
  browseSections,
  browseCommands,
  searchCommands,
  searchSections,
}: {
  mode: SubMenuMode;
  isRoot: boolean;
  isBrowseLoading: boolean;
  browseSections: SlashCommandSection[];
  browseCommands: SlashCommand[];
  searchCommands: SlashCommand[];
  searchSections: SlashCommandSection[];
}): SubMenuListProps {
  switch (mode) {
    case "search":
      return { items: searchCommands };
    case "scoped-search":
      return { sections: searchSections };
    case "browse":
      // The root renders labelled sections once its spaces are known.
      return isRoot && !isBrowseLoading
        ? { sections: browseSections }
        : { items: browseCommands };
  }
}

interface AttachContextSubMenuDropdownProps
  extends Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "editor" | "query" | "range"
  > {
  activeFrame: SlashMenuStackFrame;
  conversationId?: string | null;
  isNodeAttached?: (node: DataSourceViewContentNode) => boolean;
  onBack: () => void;
  onClose: () => void;
  onSelect: (selection: ContextSlashSearchSelection) => void;
  owner: LightWorkspaceType;
  spaceId?: string | null;
  useCase: ContextSlashSearchUseCase;
}

interface AttachContextSubMenuDropdownRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

/**
 * @cc [owner:smb2268,label:product] browse-when-query-empty
 * With the `knowledge_browser` feature enabled and an empty query the sub-menu MUST list the
 * current navigation level of the knowledge browser (spaces at the root, then categories, data
 * source views and folder contents). A non-empty query at the root MUST show the global search
 * results; below the root it MUST show two sections, the matches within the browsed level first
 * and then the remaining global results with those matches removed, while keeping the breadcrumbs
 * and the navigation state. Back, Escape and Backspace on an empty query MUST go up one level
 * while below the root, and only leave the sub-menu from the root. Without the feature the
 * sub-menu MUST behave as a search-only menu.
 */
export const AttachContextSubMenuDropdown = forwardRef<
  AttachContextSubMenuDropdownRef,
  AttachContextSubMenuDropdownProps
>(
  (
    {
      activeFrame,
      clientRect,
      conversationId = null,
      isNodeAttached,
      onBack,
      onClose,
      onSelect,
      owner,
      query,
      spaceId = null,
      useCase,
    },
    ref
  ) => {
    const dropdownRef = useRef<{
      onKeyDown: (props: { event: KeyboardEvent }) => boolean;
    }>(null);

    const { hasFeature } = useFeatureFlags();
    const isBrowserEnabled = hasFeature("knowledge_browser");
    const excludeNonRemoteDatabaseTables = useCase === "skill-builder";

    const {
      emptyMessage,
      hasMinimalQuery,
      isLoading,
      items,
      loadingMessage,
      spaces: scopedSpaces,
    } = useAttachContextSlashMenuItems({
      conversationId,
      isNodeAttached,
      owner,
      query,
      spaceId,
      useCase,
    });

    // Like the Agent Builder, only offer spaces that hold something to browse.
    const { spaces, isLoading: isBrowsableSpacesLoading } = useBrowsableSpaces({
      owner,
      spaces: scopedSpaces,
      enabled: isBrowserEnabled,
    });

    const navigation = useKnowledgeBrowserNavigation({
      spaces,
      enabled: isBrowserEnabled,
    });
    const { navigationHistory, navigateTo } = navigation;
    const currentEntry = navigationHistory[navigationHistory.length - 1];
    const canNavigateUp = navigationHistory.length > 1;
    const mode = getSubMenuMode({ isBrowserEnabled, query, canNavigateUp });

    const browser = useKnowledgeBrowserItems({
      owner,
      spaces,
      navigationHistory,
      viewType: "all",
      excludeNonRemoteDatabaseTables,
    });

    const browseItems = useMemo(
      () =>
        browser.items.filter(
          (item) => item.kind !== "node" || !isNodeAttached?.(item.node)
        ),
      [browser.items, isNodeAttached]
    );
    const browseSections = useMemo(
      () => buildRootBrowseSections(browseItems),
      [browseItems]
    );
    const browseCommands = useMemo(
      () =>
        buildBrowseCommands(browseItems, {
          currentEntry,
          isNodeAttached,
          hasMore: browser.hasMore,
          isLoadingMore: browser.isLoadingMore,
        }),
      [
        browseItems,
        browser.hasMore,
        browser.isLoadingMore,
        currentEntry,
        isNodeAttached,
      ]
    );
    const searchCommands = useMemo(
      () => items.map(toSlashCommandItem),
      [items]
    );
    const searchSections = useAttachContextSearchSections({
      emptyMessage,
      enabled: mode === "scoped-search",
      excludeNonRemoteDatabaseTables,
      hasMinimalQuery,
      isGlobalLoading: isLoading,
      isNodeAttached,
      items,
      loadingMessage,
      navigationHistory,
      owner,
      query,
      toCommand: toSlashCommandItem,
    });

    const breadcrumbs = useMemo(
      () =>
        isBrowserEnabled && canNavigateUp ? (
          // Keep the editor focused: a focused breadcrumb button would trap focus in the menu.
          <div
            className="px-2 py-1"
            onMouseDown={(event) => event.preventDefault()}
          >
            <Breadcrumbs
              items={getKnowledgeBrowserBreadcrumbItems(
                navigationHistory,
                navigateTo
              )}
              size="xs"
            />
          </div>
        ) : undefined,
      [canNavigateUp, isBrowserEnabled, navigateTo, navigationHistory]
    );

    const navigateUp = () => navigateTo(navigationHistory.length - 2);
    const isBrowseLoading =
      isLoading || isBrowsableSpacesLoading || browser.isLoading;

    const handleSelect = (item: SlashCommand) => {
      if (isNavigateKnowledgeBrowserSlashCommand(item)) {
        navigateToKnowledgeBrowserItem(item.data.item, navigation);
      } else if (isLoadMoreKnowledgeBrowserSlashCommand(item)) {
        if (!browser.isLoadingMore) {
          void browser.loadMore();
        }
      } else if (isAttachContextSlashCommand(item)) {
        onSelect(item.data.selection);
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (event.key === "Backspace" && query.trim().length === 0) {
            event.preventDefault();
            if (canNavigateUp) {
              navigateTo(navigationHistory.length - 2);
            } else {
              onClose();
            }
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [canNavigateUp, navigateTo, navigationHistory.length, onClose, query]
    );

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        clientRect={clientRect}
        command={handleSelect}
        emptyMessage={mode === "browse" ? BROWSE_EMPTY_MESSAGE : emptyMessage}
        headerContent={breadcrumbs}
        isLoading={
          mode === "browse" ? isBrowseLoading : mode === "search" && isLoading
        }
        loadingMessage={mode === "browse" ? undefined : loadingMessage}
        onClose={onClose}
        {...getSubMenuListProps({
          mode,
          isRoot: currentEntry.type === "root",
          isBrowseLoading: browser.isLoading,
          browseSections,
          browseCommands,
          searchCommands,
          searchSections,
        })}
        subMenuNavigation={{
          label: activeFrame.command.label,
          onBack: mode === "browse" && canNavigateUp ? navigateUp : onBack,
        }}
        size="wide"
      />
    );
  }
);

AttachContextSubMenuDropdown.displayName = "AttachContextSubMenuDropdown";
