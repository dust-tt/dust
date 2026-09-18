import type { SlashCommandSection } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import {
  flattenSlashCommandSections,
  SLASH_COMMAND_CAPABILITIES_SECTION_LABEL,
} from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import {
  SLASH_COMMAND_DEFAULT_LOADING_MESSAGE,
  SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import {
  ArrowLeft,
  Button,
  cn,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
  Icon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import type { SuggestionProps } from "@tiptap/suggestion";
import type React from "react";
import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

interface SlashCommandTooltip {
  description: string;
  media?: React.ReactNode;
}

const DEFAULT_EMPTY_MESSAGE = "No commands found";

const DEFAULT_LIST_MAX_HEIGHT_CLASS_NAME =
  SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME;

const SKILL_NAME_TOOLTIP_DELAY_MS = 1000;

function SlashCommandDropdownLoadingState({ message }: { message: string }) {
  return (
    <div className="flex h-14 items-center justify-center">
      <Spinner size="sm" />
      <span className="ml-2 text-sm text-muted-foreground">{message}</span>
    </div>
  );
}

export interface SlashCommandEndAction {
  label: string;
  onSelect: () => void;
}

export interface SlashCommand {
  action: string;
  // Command-specific payload, opaque to the dropdown. Consumers narrow it back with type guards
  // (e.g. isSkillSlashCommand) when handling selection or details.
  data?: unknown;
  description?: string;
  // A secondary action shown at the row's end on hover or highlight (e.g. "Add" on a folder row
  // whose main action navigates into it).
  endAction?: SlashCommandEndAction;
  // A trailing hint icon, always visible (e.g. a chevron on rows that navigate).
  endIcon?: React.ComponentType<any>;
  // Whether the item exposes a details affordance (the "…" button) when onItemDetails is provided.
  hasDetails?: boolean;
  icon: React.ComponentType<any>;
  id: string;
  label: string;
  tooltip?: SlashCommandTooltip;
  tooltipLabel?: string;
}

interface SlashCommandSubMenuNavigation {
  label: string;
  onBack: () => void;
}

export interface SlashCommandDropdownProps
  extends Pick<SuggestionProps<SlashCommand>, "clientRect" | "command"> {
  // Row highlighted when the list (re)renders; falls back to the first item.
  defaultSelectedItemId?: string | null;
  emptyMessage?: string;
  header?: string;
  // Rendered at the top of the list, after the sub-menu "Back" row when there is one (e.g. the
  // breadcrumbs of a browsable sub-menu).
  headerContent?: React.ReactNode;
  isLoading?: boolean;
  items?: SlashCommand[];
  loadingMessage?: string;
  listMaxHeightClassName?: `max-h-${string}`;
  onClose?: () => void;
  onItemDetails?: (item: SlashCommand) => void;
  subMenuNavigation?: SlashCommandSubMenuNavigation;
  sections?: SlashCommandSection[];
  size?: "default" | "wide";
}

export interface SlashCommandDropdownRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
  // The row the keyboard would act on, null when the "Back" row or nothing is highlighted.
  // Optional so wrappers that only forward key handling keep satisfying the type.
  getHighlightedItem?: () => SlashCommand | null;
}

const SUB_MENU_BACK_ITEM_ID = "slash-sub-menu-back";

/**
 * @cc [owner:PopDaph,label:react] default-selected-item
 * Whenever the item list or `defaultSelectedItemId` changes, the highlighted row is the item
 * whose id equals `defaultSelectedItemId` when present in the list, otherwise the first item
 * (after the sub-menu "Back" row when there is one).
 */
function getDefaultSelectedIndex(
  hasSubMenuNavigation: boolean,
  items: SlashCommand[],
  defaultSelectedItemId: string | null | undefined
): number {
  const offset = hasSubMenuNavigation ? 1 : 0;
  const defaultIndex = defaultSelectedItemId
    ? items.findIndex((item) => item.id === defaultSelectedItemId)
    : -1;
  if (defaultIndex >= 0) {
    return defaultIndex + offset;
  }

  return hasSubMenuNavigation && items.length > 0 ? 1 : 0;
}

/**
 * @cc [owner:smb2268,label:react] pointer-hover-keeps-editor-focus
 * Hovering a row without a `tooltip` or `tooltipLabel` MUST NOT move focus out of the editor:
 * neither the row nor the menu container receives focus from pointer events, and the hovered row
 * becomes the highlighted one. Rows with a tooltip keep the Radix pointer behavior.
 */
function getPointerHighlightProps(
  item: SlashCommand | null,
  index: number,
  setSelectedIndex: (index: number) => void
) {
  if (item?.tooltip || item?.tooltipLabel) {
    return {};
  }

  // Radix focuses the row on mouse pointer move and the menu container on mouse pointer leave. The
  // menu is modal, so once anything inside it is focused the editor can never take focus back.
  // Preventing default skips both Radix handlers. Touch moves come from scrolling the list, so
  // they leave the highlight alone.
  return {
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.pointerType !== "touch") {
        setSelectedIndex(index);
      }
    },
    onPointerLeave: (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
  };
}

// Trailing content of a row: the details "…" button and/or the end action appear on hover or
// highlight; the end icon is always visible. Returns undefined when the row has none, because the
// menu item widens its grid for any truthy `endComponent`, even one that renders nothing.
function getSlashCommandEndComponent({
  item,
  isHighlighted,
  onItemDetails,
}: {
  item: SlashCommand;
  isHighlighted: boolean;
  onItemDetails?: (item: SlashCommand) => void;
}): React.ReactNode | undefined {
  const canShowDetails = !!onItemDetails && !!item.hasDetails;
  if (!canShowDetails && !item.endAction && !item.endIcon) {
    return undefined;
  }
  const revealClassName = cn(
    "opacity-0 group-focus-within:opacity-100",
    isHighlighted && "opacity-100"
  );
  return (
    <div className="flex items-center gap-1">
      {canShowDetails ? (
        <Button
          icon={DotsHorizontal}
          variant="outline"
          size="mini"
          className={revealClassName}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onItemDetails?.(item);
          }}
        />
      ) : null}
      {item.endAction ? (
        // Plain text on the row's own hover shade, per the design: no second background or pill.
        <button
          type="button"
          className={cn(
            revealClassName,
            "rounded px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          )}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            item.endAction?.onSelect();
          }}
        >
          {item.endAction.label}
        </button>
      ) : null}
      {item.endIcon ? (
        <Icon
          visual={item.endIcon}
          size="xs"
          className="text-muted-foreground"
        />
      ) : null}
    </div>
  );
}

export const SlashCommandDropdown = forwardRef<
  SlashCommandDropdownRef,
  SlashCommandDropdownProps
>(
  (
    {
      items: itemsProp,
      sections,
      command,
      clientRect,
      defaultSelectedItemId,
      emptyMessage = DEFAULT_EMPTY_MESSAGE,
      header,
      headerContent,
      isLoading = false,
      listMaxHeightClassName = DEFAULT_LIST_MAX_HEIGHT_CLASS_NAME,
      loadingMessage = SLASH_COMMAND_DEFAULT_LOADING_MESSAGE,
      onClose,
      onItemDetails,
      subMenuNavigation,
      size = "default",
    },
    ref
  ) => {
    const items = useMemo(
      () =>
        sections ? flattenSlashCommandSections(sections) : (itemsProp ?? []),
      [itemsProp, sections]
    );
    const selectableCount = items.length + (subMenuNavigation ? 1 : 0);
    const itemIdsKey = useMemo(
      () =>
        [
          subMenuNavigation?.label ?? "",
          defaultSelectedItemId ?? "",
          ...items.map((item) => item.id),
        ].join("\0"),
      [defaultSelectedItemId, items, subMenuNavigation?.label]
    );
    const capabilitiesSectionHasItems =
      sections?.some(
        (section) =>
          section.label === SLASH_COMMAND_CAPABILITIES_SECTION_LABEL &&
          section.items.length > 0
      ) ?? false;
    const showLoadingPlaceholder = isLoading && !capabilitiesSectionHasItems;
    const hasVisibleContent =
      selectableCount > 0 || showLoadingPlaceholder || !!subMenuNavigation;

    const [selectedIndex, setSelectedIndex] = useState(() =>
      getDefaultSelectedIndex(!!subMenuNavigation, items, defaultSelectedItemId)
    );
    const [showSkillNameTooltips, setShowSkillNameTooltips] = useState(true);
    const listRef = useRef<HTMLDivElement>(null);
    const [virtualTriggerStyle, setVirtualTriggerStyle] =
      useState<React.CSSProperties>({});

    const selectEntry = useCallback(
      (index: number) => {
        if (subMenuNavigation && index === 0) {
          subMenuNavigation.onBack();
          return;
        }

        const itemIndex = subMenuNavigation ? index - 1 : index;
        const item = items[itemIndex];
        if (item) {
          command(item);
        }
      },
      [command, items, subMenuNavigation]
    );

    const handleEscapeKeyDown = useCallback(
      (event: KeyboardEvent) => {
        if (subMenuNavigation) {
          event.preventDefault();
          subMenuNavigation.onBack();
          return;
        }

        onClose?.();
      },
      [onClose, subMenuNavigation]
    );

    const highlightedItemId =
      subMenuNavigation && selectedIndex === 0
        ? SUB_MENU_BACK_ITEM_ID
        : items[subMenuNavigation ? selectedIndex - 1 : selectedIndex]?.id;

    useImperativeHandle(
      ref,
      () => ({
        getHighlightedItem: () => {
          const itemIndex = subMenuNavigation
            ? selectedIndex - 1
            : selectedIndex;
          return items[itemIndex] ?? null;
        },
        onKeyDown: ({ event }) => {
          if (selectableCount === 0 && !showLoadingPlaceholder) {
            return false;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (selectableCount === 0) {
              return true;
            }
            setSelectedIndex(
              (prevSelectedIndex) => (prevSelectedIndex + 1) % selectableCount
            );
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (selectableCount === 0) {
              return true;
            }
            setSelectedIndex(
              (prevSelectedIndex) =>
                (prevSelectedIndex + selectableCount - 1) % selectableCount
            );
            return true;
          }

          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            if (selectableCount === 0) {
              return true;
            }
            selectEntry(selectedIndex);
            return true;
          }

          if (event.key === "Escape" && subMenuNavigation) {
            event.preventDefault();
            subMenuNavigation.onBack();
            return true;
          }

          return false;
        },
      }),
      [
        items,
        selectEntry,
        selectableCount,
        selectedIndex,
        showLoadingPlaceholder,
        subMenuNavigation,
      ]
    );

    // Reset selected index when the visible item list changes, not on every render.
    // biome-ignore lint/correctness/useExhaustiveDependencies: itemIdsKey is intentional trigger
    useEffect(() => {
      setSelectedIndex(
        getDefaultSelectedIndex(
          !!subMenuNavigation,
          items,
          defaultSelectedItemId
        )
      );
    }, [itemIdsKey]);

    // Update virtual trigger position.
    const updateTriggerPosition = useCallback(() => {
      const triggerRect = clientRect?.();
      if (triggerRect) {
        setVirtualTriggerStyle({
          position: "fixed",
          left: triggerRect.left,
          top: triggerRect.top + (window.visualViewport?.offsetTop ?? 0),
          width: 1,
          height: triggerRect.height || 1,
          pointerEvents: "none",
          zIndex: -1,
        });
      }
    }, [clientRect]);

    useEffect(() => {
      updateTriggerPosition();

      const viewport = window.visualViewport;
      if (viewport) {
        // Event triggered when hitting CMD +/-.
        viewport.addEventListener("resize", updateTriggerPosition);
        return () => {
          viewport.removeEventListener("resize", updateTriggerPosition);
        };
      }
    }, [updateTriggerPosition]);

    return (
      <DropdownMenu open={true}>
        <DropdownMenuTrigger asChild>
          <div style={virtualTriggerStyle} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={size === "wide" ? "w-80" : "w-64"}
          align="start"
          avoidCollisions
          collisionPadding={12}
          highlightedItemId={highlightedItemId}
          side="bottom"
          sideOffset={4}
          onEscapeKeyDown={handleEscapeKeyDown}
          onPointerDownOutside={onClose}
          // The editor takes focus back after every selection (tiptap focuses on the next frame),
          // which Radix reports as focus leaving the layer; that must not dismiss the menu.
          onFocusOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          scrollHighlightedItemIntoView
        >
          {header ? (
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {header}
            </div>
          ) : null}
          {!hasVisibleContent ? (
            <div
              className={cn(
                SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME,
                "flex items-center justify-center px-2 py-4 text-center text-sm text-muted-foreground"
              )}
            >
              {emptyMessage}
            </div>
          ) : (
            <div
              ref={listRef}
              className={listMaxHeightClassName}
              onPointerMove={() => setShowSkillNameTooltips(true)}
              onWheel={() => setShowSkillNameTooltips(false)}
            >
              {subMenuNavigation ? (
                <DropdownMenuItem
                  icon={ArrowLeft}
                  itemId={SUB_MENU_BACK_ITEM_ID}
                  label="Back"
                  truncateText
                  endComponent={<DropdownMenuShortcut shortcut="Esc" />}
                  onClick={() => selectEntry(0)}
                  onFocus={() => setSelectedIndex(0)}
                  {...getPointerHighlightProps(null, 0, setSelectedIndex)}
                  className={cn(
                    "text-muted-foreground [&_span]:text-xs",
                    selectedIndex === 0 &&
                      "bg-muted-background [transition-duration:0ms]"
                  )}
                />
              ) : null}
              {headerContent}
              {sections ? (
                (() => {
                  let flatIndex = 0;

                  const renderItem = (item: SlashCommand, index: number) => {
                    const entryIndex = subMenuNavigation ? index + 1 : index;
                    const menuItem = (
                      <DropdownMenuItem
                        icon={item.icon}
                        itemId={item.id}
                        label={item.label}
                        description={item.description}
                        truncateText
                        endComponent={getSlashCommandEndComponent({
                          item,
                          isHighlighted: entryIndex === selectedIndex,
                          onItemDetails,
                        })}
                        onClick={() => selectEntry(entryIndex)}
                        {...getPointerHighlightProps(
                          item,
                          entryIndex,
                          setSelectedIndex
                        )}
                        onFocus={(event) => {
                          if (
                            item.tooltipLabel &&
                            event.currentTarget.matches(":hover")
                          ) {
                            // Menu items focus on pointer move, which would bypass the tooltip delay.
                            event.stopPropagation();
                          }
                          setSelectedIndex(entryIndex);
                        }}
                        className={cn(
                          "group",
                          entryIndex === selectedIndex &&
                            "bg-muted-background [transition-duration:0ms]"
                        )}
                      />
                    );

                    const itemContent =
                      item.tooltipLabel && showSkillNameTooltips ? (
                        <Tooltip
                          delayDuration={SKILL_NAME_TOOLTIP_DELAY_MS}
                          label={item.tooltipLabel}
                          tooltipTriggerAsChild
                          trigger={
                            <span className="block w-full">{menuItem}</span>
                          }
                        />
                      ) : item.tooltip ? (
                        <DropdownTooltipTrigger
                          description={item.tooltip.description}
                          media={item.tooltip.media}
                          side="right"
                          sideOffset={8}
                        >
                          {menuItem}
                        </DropdownTooltipTrigger>
                      ) : (
                        menuItem
                      );

                    return <Fragment key={item.id}>{itemContent}</Fragment>;
                  };

                  return (
                    <>
                      {sections.map((section) => (
                        <Fragment key={section.label}>
                          <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
                          {section.items.map((item) => {
                            const index = flatIndex;
                            flatIndex += 1;
                            return renderItem(item, index);
                          })}
                          {section.items.length === 0 && section.isLoading ? (
                            <SlashCommandDropdownLoadingState
                              message={
                                section.loadingMessage ??
                                SLASH_COMMAND_DEFAULT_LOADING_MESSAGE
                              }
                            />
                          ) : null}
                          {section.items.length === 0 &&
                          !section.isLoading &&
                          section.emptyMessage ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              {section.emptyMessage}
                            </div>
                          ) : null}
                        </Fragment>
                      ))}
                      {showLoadingPlaceholder ? (
                        <>
                          <DropdownMenuLabel>
                            {SLASH_COMMAND_CAPABILITIES_SECTION_LABEL}
                          </DropdownMenuLabel>
                          <SlashCommandDropdownLoadingState
                            message={loadingMessage}
                          />
                        </>
                      ) : null}
                    </>
                  );
                })()
              ) : items.length === 0 ? (
                isLoading ? (
                  <SlashCommandDropdownLoadingState message={loadingMessage} />
                ) : (
                  <div className="flex h-14 items-center justify-center px-2 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </div>
                )
              ) : (
                items.map((item, index) => {
                  const entryIndex = subMenuNavigation ? index + 1 : index;
                  const menuItem = (
                    <DropdownMenuItem
                      icon={item.icon}
                      itemId={item.id}
                      label={item.label}
                      description={item.description}
                      truncateText
                      endComponent={getSlashCommandEndComponent({
                        item,
                        isHighlighted: entryIndex === selectedIndex,
                        onItemDetails,
                      })}
                      onClick={() => selectEntry(entryIndex)}
                      {...getPointerHighlightProps(
                        item,
                        entryIndex,
                        setSelectedIndex
                      )}
                      onFocus={(event) => {
                        if (
                          item.tooltipLabel &&
                          event.currentTarget.matches(":hover")
                        ) {
                          // Menu items focus on pointer move, which would bypass the tooltip delay.
                          event.stopPropagation();
                        }
                        setSelectedIndex(entryIndex);
                      }}
                      className={cn(
                        "group",
                        entryIndex === selectedIndex &&
                          "bg-muted-background [transition-duration:0ms]"
                      )}
                    />
                  );

                  const itemContent =
                    item.tooltipLabel && showSkillNameTooltips ? (
                      <Tooltip
                        delayDuration={SKILL_NAME_TOOLTIP_DELAY_MS}
                        label={item.tooltipLabel}
                        tooltipTriggerAsChild
                        trigger={
                          <span className="block w-full">{menuItem}</span>
                        }
                      />
                    ) : item.tooltip ? (
                      <DropdownTooltipTrigger
                        description={item.tooltip.description}
                        media={item.tooltip.media}
                        side="right"
                        sideOffset={8}
                      >
                        {menuItem}
                      </DropdownTooltipTrigger>
                    ) : (
                      menuItem
                    );

                  return <Fragment key={item.id}>{itemContent}</Fragment>;
                })
              )}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

SlashCommandDropdown.displayName = "SlashCommandDropdown";
