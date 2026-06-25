import {
  flattenSlashCommandSections,
  SLASH_COMMAND_CAPABILITIES_SECTION_LABEL,
  type SlashCommandSection,
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
  Spinner,
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

function SlashCommandDropdownLoadingState({ message }: { message: string }) {
  return (
    <div className="flex h-14 items-center justify-center">
      <Spinner size="sm" />
      <span className="ml-2 text-sm text-gray-500 dark:text-gray-500-night">
        {message}
      </span>
    </div>
  );
}

export interface SlashCommand {
  action: string;
  // Command-specific payload, opaque to the dropdown. Consumers narrow it back with type guards
  // (e.g. isSkillSlashCommand) when handling selection or details.
  data?: unknown;
  description?: string;
  // Whether the item exposes a details affordance (the "…" button) when onItemDetails is provided.
  hasDetails?: boolean;
  icon: React.ComponentType<any>;
  id: string;
  label: string;
  tooltip?: SlashCommandTooltip;
}

export interface SlashCommandSubMenuNavigation {
  label: string;
  onBack: () => void;
}

export interface SlashCommandDropdownProps
  extends Pick<SuggestionProps<SlashCommand>, "clientRect" | "command"> {
  emptyMessage?: string;
  header?: string;
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
}

const SUB_MENU_BACK_ITEM_ID = "slash-sub-menu-back";

function getDefaultSelectedIndex(
  hasSubMenuNavigation: boolean,
  itemCount: number
): number {
  return hasSubMenuNavigation && itemCount > 0 ? 1 : 0;
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
      emptyMessage = DEFAULT_EMPTY_MESSAGE,
      header,
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
        [subMenuNavigation?.label ?? "", ...items.map((item) => item.id)].join(
          "\0"
        ),
      [items, subMenuNavigation?.label]
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
      getDefaultSelectedIndex(!!subMenuNavigation, items.length)
    );
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
        getDefaultSelectedIndex(!!subMenuNavigation, items.length)
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
          onInteractOutside={onClose}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          scrollHighlightedItemIntoView
        >
          {header ? (
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
              {header}
            </div>
          ) : null}
          {!hasVisibleContent ? (
            <div
              className={cn(
                SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME,
                "flex items-center justify-center px-2 py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night"
              )}
            >
              {emptyMessage}
            </div>
          ) : (
            <div ref={listRef} className={listMaxHeightClassName}>
              {subMenuNavigation ? (
                <DropdownMenuItem
                  icon={ArrowLeft}
                  itemId={SUB_MENU_BACK_ITEM_ID}
                  label="Back"
                  truncateText
                  endComponent={<DropdownMenuShortcut shortcut="Esc" />}
                  onClick={() => selectEntry(0)}
                  onPointerMove={(event) => {
                    event.preventDefault();
                    setSelectedIndex(0);
                  }}
                  onPointerLeave={(event) => event.preventDefault()}
                  className={cn(
                    "text-muted-foreground dark:text-muted-foreground-night [&_span]:text-xs",
                    selectedIndex === 0 &&
                      "bg-muted-background dark:bg-muted-night [transition-duration:0ms]"
                  )}
                />
              ) : null}
              {sections ? (
                (() => {
                  let flatIndex = 0;

                  const renderItem = (item: SlashCommand, index: number) => {
                    const canShowDetails = !!onItemDetails && !!item.hasDetails;
                    const menuItem = (
                      <DropdownMenuItem
                        icon={item.icon}
                        itemId={item.id}
                        label={item.label}
                        description={item.description}
                        truncateText
                        endComponent={
                          canShowDetails ? (
                            <Button
                              icon={DotsHorizontal}
                              variant="outline"
                              size="mini"
                              className={cn(
                                "opacity-0 group-focus-within:opacity-100",
                                index === selectedIndex && "opacity-100"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onItemDetails?.(item);
                              }}
                            />
                          ) : undefined
                        }
                        onClick={() => selectEntry(index)}
                        onPointerMove={(e) => {
                          e.preventDefault();
                          setSelectedIndex(index);
                        }}
                        onPointerLeave={(e) => e.preventDefault()}
                        className={cn(
                          "group",
                          index === selectedIndex &&
                            "bg-muted-background dark:bg-muted-night [transition-duration:0ms]"
                        )}
                      />
                    );

                    const itemContent = item.tooltip ? (
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
                  <div className="flex h-14 items-center justify-center px-2 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {emptyMessage}
                  </div>
                )
              ) : (
                items.map((item, index) => {
                  const entryIndex = subMenuNavigation ? index + 1 : index;
                  const canShowDetails = !!onItemDetails && !!item.hasDetails;
                  const menuItem = (
                    <DropdownMenuItem
                      icon={item.icon}
                      itemId={item.id}
                      label={item.label}
                      description={item.description}
                      truncateText
                      endComponent={
                        canShowDetails ? (
                          <Button
                            icon={DotsHorizontal}
                            variant="outline"
                            size="mini"
                            className={cn(
                              "opacity-0 group-focus-within:opacity-100",
                              entryIndex === selectedIndex && "opacity-100"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              onItemDetails?.(item);
                            }}
                          />
                        ) : undefined
                      }
                      onClick={() => selectEntry(entryIndex)}
                      onPointerMove={(e) => {
                        e.preventDefault();
                        setSelectedIndex(entryIndex);
                      }}
                      onPointerLeave={(e) => e.preventDefault()}
                      className={cn(
                        "group",
                        entryIndex === selectedIndex &&
                          "bg-muted-background dark:bg-muted-night [transition-duration:0ms]"
                      )}
                    />
                  );

                  const itemContent = item.tooltip ? (
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
