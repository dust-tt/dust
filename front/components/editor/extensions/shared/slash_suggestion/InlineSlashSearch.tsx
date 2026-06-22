import { SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type {
  CSSProperties,
  FocusEvent,
  FormEvent,
  KeyboardEvent,
} from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const INTERACT_OUTSIDE_GRACE_MS = 350;

export interface InlineSlashSearchProps {
  deferDropdownUntilFocus?: boolean;
  dropdownContent: React.ReactNode;
  isDropdownOpen: boolean;
  itemCount: number;
  onCancel: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectIndex: (index: number) => void;
  onSelectedIndexChange: (index: number) => void;
  placeholder: string;
  searchQuery: string;
  selectedIndex: number;
}

export function InlineSlashSearch({
  deferDropdownUntilFocus = false,
  dropdownContent,
  isDropdownOpen,
  itemCount,
  onCancel,
  onSearchQueryChange,
  onSelectIndex,
  onSelectedIndexChange,
  placeholder,
  searchQuery,
  selectedIndex,
}: InlineSlashSearchProps) {
  const contentRef = useRef<HTMLSpanElement>(null);
  const mountedAtRef = useRef(Date.now());
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isAnchorReady, setIsAnchorReady] = useState(false);
  const [virtualTriggerStyle, setVirtualTriggerStyle] = useState<CSSProperties>(
    {}
  );

  const updateTriggerPosition = useCallback(() => {
    const anchorRect = contentRef.current?.getBoundingClientRect();
    if (!anchorRect || anchorRect.width === 0) {
      return;
    }

    setVirtualTriggerStyle({
      position: "fixed",
      left: anchorRect.left,
      top: anchorRect.top + (window.visualViewport?.offsetTop ?? 0),
      width: 1,
      height: anchorRect.height || 1,
      pointerEvents: "none",
      zIndex: -1,
    });
    setIsAnchorReady(true);
  }, []);

  useLayoutEffect(() => {
    updateTriggerPosition();
  }, [updateTriggerPosition]);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateTriggerPosition();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [updateTriggerPosition]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    viewport.addEventListener("resize", updateTriggerPosition);
    viewport.addEventListener("scroll", updateTriggerPosition);
    return () => {
      viewport.removeEventListener("resize", updateTriggerPosition);
      viewport.removeEventListener("scroll", updateTriggerPosition);
    };
  }, [updateTriggerPosition]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      contentElement.focus();
      setIsInputFocused(true);
      updateTriggerPosition();

      const range = document.createRange();
      const selection = window.getSelection();
      if (selection) {
        range.selectNodeContents(contentElement);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, 10);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [updateTriggerPosition]);

  const handleInput = useCallback(
    (event: FormEvent<HTMLSpanElement>) => {
      onSearchQueryChange(event.currentTarget.textContent ?? "");
    },
    [onSearchQueryChange]
  );

  const handleFocus = useCallback(() => {
    setIsInputFocused(true);
    updateTriggerPosition();
  }, [updateTriggerPosition]);

  const handleBlur = useCallback((event: FocusEvent<HTMLSpanElement>) => {
    const nextFocusedElement = event.relatedTarget;
    if (
      nextFocusedElement instanceof Node &&
      event.currentTarget.parentElement?.contains(nextFocusedElement)
    ) {
      return;
    }

    setIsInputFocused(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }

      if (!isDropdownOpen || itemCount === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        onSelectedIndexChange((selectedIndex + 1) % itemCount);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        onSelectedIndexChange((selectedIndex + itemCount - 1) % itemCount);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        onSelectIndex(selectedIndex);
      }
    },
    [
      isDropdownOpen,
      itemCount,
      onCancel,
      onSelectIndex,
      onSelectedIndexChange,
      selectedIndex,
    ]
  );

  const handleInteractOutside = useCallback(
    (event: Event) => {
      if (Date.now() - mountedAtRef.current < INTERACT_OUTSIDE_GRACE_MS) {
        event.preventDefault();
        return;
      }

      window.setTimeout(() => {
        if (!searchQuery.trim()) {
          onCancel();
        }
      }, 50);
    },
    [onCancel, searchQuery]
  );

  const shouldShowDropdown =
    isDropdownOpen &&
    isAnchorReady &&
    (!deferDropdownUntilFocus || isInputFocused);

  return (
    <div className="relative inline-block">
      <span
        className={cn(
          "inline-block h-7 cursor-text px-3 py-1 text-sm font-normal",
          "rounded bg-gray-100 dark:bg-gray-800",
          "text-center text-gray-500 dark:text-gray-500-night",
          "empty:before:content-[attr(data-placeholder)] focus:outline-none",
          "min-w-36 text-left"
        )}
        contentEditable
        suppressContentEditableWarning
        ref={contentRef}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        data-placeholder={placeholder}
      />

      {shouldShowDropdown && (
        <DropdownMenu open={true}>
          <DropdownMenuTrigger asChild>
            <div style={virtualTriggerStyle} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-80"
            align="start"
            avoidCollisions
            collisionPadding={12}
            side="bottom"
            sideOffset={4}
            onInteractOutside={handleInteractOutside}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <div className={SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME}>
              {dropdownContent}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
