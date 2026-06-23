import {
  flattenSlashCommandSections,
  SLASH_COMMAND_CAPABILITIES_SECTION_LABEL,
  type SlashCommandSection,
} from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import { SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import {
  Button,
  cn,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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

export interface SlashCommandDropdownProps
  extends Pick<SuggestionProps<SlashCommand>, "clientRect" | "command"> {
  emptyMessage?: string;
  header?: string;
  isLoadingCapabilities?: boolean;
  items?: SlashCommand[];
  listMaxHeightClassName?: `max-h-${string}`;
  onClose?: () => void;
  onItemDetails?: (item: SlashCommand) => void;
  sections?: SlashCommandSection[];
  size?: "default" | "wide";
}

export interface SlashCommandDropdownRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
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
      isLoadingCapabilities = false,
      listMaxHeightClassName = DEFAULT_LIST_MAX_HEIGHT_CLASS_NAME,
      onClose,
      onItemDetails,
      size = "default",
    },
    ref
  ) => {
    const items = useMemo(
      () =>
        sections ? flattenSlashCommandSections(sections) : (itemsProp ?? []),
      [itemsProp, sections]
    );
    const itemIdsKey = useMemo(
      () => items.map((item) => item.id).join("\0"),
      [items]
    );
    const showCapabilitiesLoading =
      isLoadingCapabilities &&
      !sections?.some(
        (section) =>
          section.label === SLASH_COMMAND_CAPABILITIES_SECTION_LABEL &&
          section.items.length > 0
      );
    const hasVisibleContent = items.length > 0 || showCapabilitiesLoading;

    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const [virtualTriggerStyle, setVirtualTriggerStyle] =
      useState<React.CSSProperties>({});

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command(item);
        }
      },
      [command, items]
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (items.length === 0) {
            return false;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex(
              (prevSelectedIndex) => (prevSelectedIndex + 1) % items.length
            );
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex(
              (prevSelectedIndex) =>
                (prevSelectedIndex + items.length - 1) % items.length
            );
            return true;
          }

          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            selectItem(selectedIndex);
            return true;
          }

          return false;
        },
      }),
      [selectItem, selectedIndex, items.length]
    );

    // Reset selected index when the visible item list changes, not on every render.
    // biome-ignore lint/correctness/useExhaustiveDependencies: itemIdsKey is intentional trigger
    useEffect(() => {
      setSelectedIndex(0);
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
          highlightedItemId={items[selectedIndex]?.id}
          side="bottom"
          sideOffset={4}
          onEscapeKeyDown={onClose}
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
              {sections
                ? (() => {
                    let flatIndex = 0;

                    const renderItem = (item: SlashCommand, index: number) => {
                      const canShowDetails =
                        !!onItemDetails && !!item.hasDetails;
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
                          onClick={() => selectItem(index)}
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
                            <DropdownMenuLabel>
                              {section.label}
                            </DropdownMenuLabel>
                            {section.items.map((item) => {
                              const index = flatIndex;
                              flatIndex += 1;
                              return renderItem(item, index);
                            })}
                          </Fragment>
                        ))}
                        {showCapabilitiesLoading ? (
                          <>
                            <DropdownMenuLabel>
                              {SLASH_COMMAND_CAPABILITIES_SECTION_LABEL}
                            </DropdownMenuLabel>
                            <div className="flex h-14 items-center justify-center">
                              <Spinner size="sm" />
                              <span className="ml-2 text-sm text-gray-500 dark:text-gray-500-night">
                                Loading capabilities…
                              </span>
                            </div>
                          </>
                        ) : null}
                      </>
                    );
                  })()
                : items.map((item, index) => {
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
                        onClick={() => selectItem(index)}
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
                  })}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

SlashCommandDropdown.displayName = "SlashCommandDropdown";
