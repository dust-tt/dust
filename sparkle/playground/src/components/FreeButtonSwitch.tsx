import {
  AnimatedText,
  Button,
  File02,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  Separator,
  XClose,
  type ButtonProps,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type Key,
  type MouseEvent,
} from "react";

export const FREE_BUTTON_SWITCH_TAB_DRAG_MIME =
  "application/x-dust-free-button-switch-tab";

export const DATA_SOURCE_FILE_DRAG_MIME = "application/x-dust-data-source-kind";

export const DATA_SOURCE_FILE_NAME_DRAG_MIME =
  "application/x-dust-data-source-name";

export interface FreeButtonSwitchContextMenuItem {
  label: string;
  onClick?: () => void;
  icon?: ComponentType;
  variant?: "default" | "warning";
}

export interface FreeButtonSwitchOption<TValue extends string> {
  id?: Key;
  value: TValue;
  label?: string;
  icon?: ComponentType;
  tooltip?: string;
  ariaLabel?: string;
  pinned?: "end";
  draggable?: boolean;
  removable?: boolean;
  contextMenuItems?: FreeButtonSwitchContextMenuItem[];
}

type FreeButtonSwitchSize = "xmini" | "mini" | "xs" | "sm" | "md";

interface FreeButtonSwitchProps<TValue extends string> {
  value: TValue;
  options: FreeButtonSwitchOption<TValue>[];
  onValueChange: (value: TValue) => void;
  onOptionsReorder?: (nextOptions: FreeButtonSwitchOption<TValue>[]) => void;
  onDropCreateOption?: (fileId: string) => void;
  onRemoveOption?: (value: TValue) => void;
  isFileDragActive?: boolean;
  draggingFileLabel?: string | null;
  enableReorder?: boolean;
  size?: FreeButtonSwitchSize;
  activeVariant?: ButtonProps["variant"];
  inactiveVariant?: ButtonProps["variant"];
}

const COMPACT_MODE_BUFFER_PX = 4;

function isTabReorderDrag(event: DragEvent) {
  return event.dataTransfer.types.includes(FREE_BUTTON_SWITCH_TAB_DRAG_MIME);
}

function isFileDrag(event: DragEvent) {
  return (
    event.dataTransfer.types.includes(DATA_SOURCE_FILE_DRAG_MIME) ||
    (event.dataTransfer.types.includes("text/plain") &&
      !event.dataTransfer.types.includes(FREE_BUTTON_SWITCH_TAB_DRAG_MIME))
  );
}

function isDataSourceFileDragEvent(event: globalThis.DragEvent) {
  return (
    event.dataTransfer?.types.includes(DATA_SOURCE_FILE_DRAG_MIME) ?? false
  );
}

function reorderOptions<TValue extends string>(
  options: FreeButtonSwitchOption<TValue>[],
  draggedValue: TValue,
  targetValue: TValue
) {
  if (draggedValue === targetValue) {
    return options;
  }

  const reorderable = options.filter((option) => option.pinned !== "end");
  const pinned = options.filter((option) => option.pinned === "end");
  const fromIndex = reorderable.findIndex(
    (option) => option.value === draggedValue
  );
  const toIndex = reorderable.findIndex(
    (option) => option.value === targetValue
  );

  if (fromIndex === -1 || toIndex === -1) {
    return options;
  }

  const nextReorderable = [...reorderable];
  const [moved] = nextReorderable.splice(fromIndex, 1);
  nextReorderable.splice(toIndex, 0, moved);

  return [...nextReorderable, ...pinned];
}

export function FreeButtonSwitch<TValue extends string>({
  value,
  options,
  onValueChange,
  onOptionsReorder,
  onDropCreateOption,
  onRemoveOption,
  isFileDragActive = false,
  draggingFileLabel = null,
  enableReorder = Boolean(onOptionsReorder),
  size = "sm",
  activeVariant = "outline",
  inactiveVariant = "ghost-secondary",
}: FreeButtonSwitchProps<TValue>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullLabelsRef = useRef<HTMLDivElement>(null);
  const [shouldHideLabels, setShouldHideLabels] = useState(false);
  const [draggingTabValue, setDraggingTabValue] = useState<TValue | null>(null);
  const [dropTargetValue, setDropTargetValue] = useState<TValue | null>(null);
  const [isFileDropHighlight, setIsFileDropHighlight] = useState(false);
  const [isDocumentFileDragActive, setIsDocumentFileDragActive] =
    useState(false);
  const [documentDragFileLabel, setDocumentDragFileLabel] = useState<
    string | null
  >(null);
  const [contextMenuState, setContextMenuState] = useState<{
    value: TValue;
    x: number;
    y: number;
  } | null>(null);

  const reorderableOptions = options.filter(
    (option) => option.pinned !== "end"
  );
  const pinnedEndOptions = options.filter((option) => option.pinned === "end");
  const canReorder = enableReorder && Boolean(onOptionsReorder);
  const showAddToLabel =
    Boolean(onDropCreateOption) &&
    (isFileDragActive || isDocumentFileDragActive);
  const activeFileLabel = draggingFileLabel ?? documentDragFileLabel;
  const showFileDropPlaceholder =
    isFileDropHighlight && Boolean(activeFileLabel);

  useEffect(() => {
    if (!onDropCreateOption) {
      return;
    }

    const handleDocumentDragStart = (event: globalThis.DragEvent) => {
      if (isDataSourceFileDragEvent(event)) {
        setIsDocumentFileDragActive(true);
        const fileName = event.dataTransfer?.getData(
          DATA_SOURCE_FILE_NAME_DRAG_MIME
        );
        setDocumentDragFileLabel(fileName || null);
      }
    };

    const handleDocumentDragEnd = () => {
      setIsDocumentFileDragActive(false);
      setDocumentDragFileLabel(null);
    };

    document.addEventListener("dragstart", handleDocumentDragStart);
    document.addEventListener("dragend", handleDocumentDragEnd);
    document.addEventListener("drop", handleDocumentDragEnd);

    return () => {
      document.removeEventListener("dragstart", handleDocumentDragStart);
      document.removeEventListener("dragend", handleDocumentDragEnd);
      document.removeEventListener("drop", handleDocumentDragEnd);
    };
  }, [onDropCreateOption]);

  const updateLabelVisibility = useCallback(() => {
    const container = containerRef.current;
    const fullLabels = fullLabelsRef.current;
    if (!container || !fullLabels) {
      return;
    }

    const availableWidth = container.getBoundingClientRect().width;
    const fullLabelsWidth = fullLabels.scrollWidth;
    setShouldHideLabels(
      fullLabelsWidth > availableWidth - COMPACT_MODE_BUFFER_PX
    );
  }, []);

  useLayoutEffect(() => {
    updateLabelVisibility();

    const container = containerRef.current;
    const fullLabels = fullLabelsRef.current;
    if (!container || !fullLabels || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(updateLabelVisibility);
    resizeObserver.observe(container);
    resizeObserver.observe(fullLabels);

    return () => resizeObserver.disconnect();
  }, [updateLabelVisibility, options]);

  const handleTabDragStart = (
    option: FreeButtonSwitchOption<TValue>,
    event: DragEvent<HTMLDivElement>
  ) => {
    if (!canReorder || option.pinned === "end" || option.draggable === false) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.setData(FREE_BUTTON_SWITCH_TAB_DRAG_MIME, option.value);
    event.dataTransfer.effectAllowed = "move";
    setDraggingTabValue(option.value);
  };

  const handleTabDragEnd = () => {
    setDraggingTabValue(null);
    setDropTargetValue(null);
    setIsFileDropHighlight(false);
    setIsDocumentFileDragActive(false);
    setDocumentDragFileLabel(null);
  };

  const handleTabDragOver = (
    option: FreeButtonSwitchOption<TValue>,
    event: DragEvent<HTMLDivElement>
  ) => {
    if (isTabReorderDrag(event)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTargetValue(option.value);
      setIsFileDropHighlight(false);
      return;
    }

    if (isFileDrag(event) && onDropCreateOption) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setIsFileDropHighlight(true);
      setDropTargetValue(null);
    }
  };

  const handleTabDrop = (
    option: FreeButtonSwitchOption<TValue>,
    event: DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (isTabReorderDrag(event) && canReorder && onOptionsReorder) {
      const draggedValue = event.dataTransfer.getData(
        FREE_BUTTON_SWITCH_TAB_DRAG_MIME
      ) as TValue;
      if (draggedValue) {
        onOptionsReorder(reorderOptions(options, draggedValue, option.value));
      }
      handleTabDragEnd();
      return;
    }

    if (isFileDrag(event) && onDropCreateOption) {
      const fileId = event.dataTransfer.getData("text/plain");
      if (fileId) {
        onDropCreateOption(fileId);
      }
      handleTabDragEnd();
    }
  };

  const handleStripDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (isTabReorderDrag(event)) {
      event.preventDefault();
      return;
    }

    if (isFileDrag(event) && onDropCreateOption) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setIsFileDropHighlight(true);
    }
  };

  const handleStripDrop = (event: DragEvent<HTMLDivElement>) => {
    if (isFileDrag(event) && onDropCreateOption) {
      event.preventDefault();
      const fileId = event.dataTransfer.getData("text/plain");
      if (fileId) {
        onDropCreateOption(fileId);
      }
      handleTabDragEnd();
    }
  };

  const getOptionContextMenuItems = useCallback(
    (
      option: FreeButtonSwitchOption<TValue>
    ): FreeButtonSwitchContextMenuItem[] => {
      if (option.contextMenuItems?.length) {
        return option.contextMenuItems;
      }

      if (onRemoveOption && option.removable) {
        return [
          {
            label: "Remove from topbar",
            icon: XClose,
            variant: "warning",
            onClick: () => onRemoveOption(option.value),
          },
        ];
      }

      return [];
    },
    [onRemoveOption]
  );

  const handleOptionContextMenu = (
    option: FreeButtonSwitchOption<TValue>,
    event: MouseEvent<HTMLDivElement>
  ) => {
    if (getOptionContextMenuItems(option).length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenuState({
      value: option.value,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const renderOptionButton = (
    option: FreeButtonSwitchOption<TValue>,
    hideLabels: boolean,
    interactive: boolean
  ) => {
    const fallbackLabel = option.tooltip ?? option.label ?? option.ariaLabel;
    const isDraggable =
      interactive &&
      canReorder &&
      option.pinned !== "end" &&
      option.draggable !== false;

    const button = (
      <Button
        variant={option.value === value ? activeVariant : inactiveVariant}
        size={size}
        label={hideLabels ? undefined : option.label}
        icon={option.icon}
        tooltip={hideLabels ? fallbackLabel : option.tooltip}
        aria-label={option.ariaLabel ?? fallbackLabel}
        onClick={() => onValueChange(option.value)}
      />
    );

    if (!interactive) {
      return (
        <div key={option.id ?? option.value} className="s-shrink-0">
          {button}
        </div>
      );
    }

    return (
      <div
        key={option.id ?? option.value}
        className={cn(
          "s-shrink-0 s-rounded-lg s-transition-colors",
          isDraggable && "s-cursor-grab active:s-cursor-grabbing",
          draggingTabValue === option.value && "s-opacity-50",
          dropTargetValue === option.value &&
            "s-bg-muted-background dark:s-bg-muted-background-night"
        )}
        draggable={isDraggable}
        onDragStart={(event) => handleTabDragStart(option, event)}
        onDragEnd={handleTabDragEnd}
        onDragOver={(event) => handleTabDragOver(option, event)}
        onDragLeave={() => {
          if (dropTargetValue === option.value) {
            setDropTargetValue(null);
          }
        }}
        onDrop={(event) => handleTabDrop(option, event)}
        onContextMenu={(event) => handleOptionContextMenu(option, event)}
      >
        {button}
      </div>
    );
  };

  const renderOptionGroups = (hideLabels: boolean, interactive: boolean) => (
    <>
      <div
        className="s-flex s-min-w-0 s-flex-1 s-items-center s-gap-1"
        onDragOver={interactive ? handleStripDragOver : undefined}
        onDragLeave={
          interactive ? () => setIsFileDropHighlight(false) : undefined
        }
        onDrop={interactive ? handleStripDrop : undefined}
      >
        {reorderableOptions.map((option) =>
          renderOptionButton(option, hideLabels, interactive)
        )}
        {interactive && showFileDropPlaceholder && (
          <div className="s-shrink-0">
            <Button
              variant="outline"
              size={size}
              label={hideLabels ? undefined : (activeFileLabel ?? undefined)}
              icon={File02}
              tooltip={hideLabels ? (activeFileLabel ?? undefined) : undefined}
              aria-label={activeFileLabel ?? "Add file to topbar"}
              className="s-pointer-events-none s-opacity-50"
            />
          </div>
        )}
      </div>
      {pinnedEndOptions.length > 0 && (
        <>
          <Separator orientation="vertical" className="s-h-5" />
          <div className="s-flex s-shrink-0 s-items-center s-gap-1">
            {pinnedEndOptions.map((option) =>
              renderOptionButton(option, hideLabels, interactive)
            )}
          </div>
        </>
      )}
    </>
  );

  const contextMenuOption = contextMenuState
    ? options.find((option) => option.value === contextMenuState.value)
    : undefined;

  return (
    <>
      <div ref={containerRef} className="s-relative s-w-full">
        <div className="s-flex s-items-center s-gap-2">
          {showAddToLabel && (
            <AnimatedText
              variant="muted"
              className="s-shrink-0 s-text-sm s-italic"
            >
              Add to...
            </AnimatedText>
          )}
          <div className="s-flex s-min-w-0 s-flex-1 s-items-center s-gap-1">
            {renderOptionGroups(shouldHideLabels, true)}
          </div>
        </div>
        <div
          ref={fullLabelsRef}
          className="s-invisible s-pointer-events-none s-absolute s-left-0 s-top-0 s-flex s-items-center s-gap-1 s-whitespace-nowrap"
          aria-hidden
        >
          {renderOptionGroups(false, false)}
        </div>
      </div>

      {contextMenuState && contextMenuOption && (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) {
              setContextMenuState(null);
            }
          }}
          modal
        >
          <DropdownMenuPortal>
            <DropdownMenuContent
              align="start"
              className="s-whitespace-nowrap"
              style={{
                position: "fixed",
                left: contextMenuState.x,
                top: contextMenuState.y,
              }}
            >
              <DropdownMenuGroup>
                {getOptionContextMenuItems(contextMenuOption).map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    label={item.label}
                    icon={item.icon}
                    variant={item.variant}
                    onClick={() => {
                      item.onClick?.();
                      setContextMenuState(null);
                    }}
                  />
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      )}
    </>
  );
}
