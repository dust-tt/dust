import React, { useCallback, useEffect, useMemo, useState } from "react";

import type { TocItem } from "@app/lib/contentful/tableOfContents";
import { classNames } from "@app/lib/utils";

const HEADER_OFFSET = 96;
const SCROLL_DEBOUNCE_MS = 100;

interface TableOfContentsProps {
  items: TocItem[];
  className?: string;
}

interface TocItemWithChildren extends TocItem {
  children: TocItemWithChildren[];
}

function buildHierarchy(items: TocItem[]): TocItemWithChildren[] {
  const result: TocItemWithChildren[] = [];
  const stack: TocItemWithChildren[] = [];

  for (const item of items) {
    const itemWithChildren: TocItemWithChildren = {
      ...item,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      result.push(itemWithChildren);
    } else {
      stack[stack.length - 1].children.push(itemWithChildren);
    }

    stack.push(itemWithChildren);
  }

  return result;
}

function findActiveHeadingId(items: TocItem[]): string {
  const scrollPosition = window.scrollY + HEADER_OFFSET + 50;

  const headings = items
    .map((item) => {
      const element = document.getElementById(item.id);
      return element
        ? {
            id: item.id,
            top: element.getBoundingClientRect().top + window.scrollY,
          }
        : null;
    })
    .filter((h): h is { id: string; top: number } => h !== null)
    .sort((a, b) => a.top - b.top);

  let activeId = headings[0]?.id ?? "";
  for (const heading of headings) {
    if (heading.top <= scrollPosition) {
      activeId = heading.id;
    } else {
      break;
    }
  }

  return activeId;
}

interface TocItemComponentProps {
  item: TocItemWithChildren;
  activeId: string;
  onItemClick: (itemId: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
}

function TocItemComponent({
  item,
  activeId,
  onItemClick,
}: TocItemComponentProps) {
  const isActive = activeId === item.id;
  const hasActiveChild = item.children.some(
    (child) =>
      activeId === child.id ||
      child.children.some((grandchild) => activeId === grandchild.id)
  );
  const shouldShowChildren = isActive || hasActiveChild;

  return (
    <div className="transition-all duration-200">
      <a
        href={`#${item.id}`}
        onClick={(e) => onItemClick(item.id, e)}
        className={classNames(
          "block border-l-2 py-1 pl-3 text-sm transition-all duration-200 ease-in-out",
          item.level === 1 && "font-medium",
          item.level === 2 && "ml-4",
          item.level === 3 && "ml-8",
          item.level === 4 && "ml-12",
          isActive
            ? "border-primary text-foreground dark:text-foreground-night"
            : "border-transparent text-muted-foreground hover:border-border hover:text-foreground dark:text-muted-foreground-night dark:hover:text-foreground-night"
        )}
      >
        {item.text}
      </a>
      {item.children.length > 0 && (
        <div
          className={classNames(
            "transition-all duration-300 ease-in-out",
            shouldShowChildren
              ? "max-h-screen opacity-100"
              : "max-h-0 overflow-hidden opacity-0"
          )}
        >
          <div className="mt-1 space-y-1 pl-1">
            {item.children.map((child) => (
              <TocItemComponent
                key={child.id}
                item={child}
                activeId={activeId}
                onItemClick={onItemClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TableOfContents({ items, className }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  const hierarchy = useMemo(() => buildHierarchy(items), [items]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    let timeoutId: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        const newActiveId = findActiveHeadingId(items);
        setActiveId((prev) => (prev !== newActiveId ? newActiveId : prev));
      }, SCROLL_DEBOUNCE_MS);
    };

    setActiveId(findActiveHeadingId(items));

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [items]);

  const handleClick = useCallback(
    (itemId: string, e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const element = document.getElementById(itemId);
      if (!element) {
        return;
      }

      setActiveId(itemId);

      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition =
        elementPosition + window.pageYOffset - HEADER_OFFSET;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    },
    []
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={classNames(
        "sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto",
        className ?? null
      )}
    >
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
        Table of contents
      </h3>
      <nav className="space-y-1" aria-label="Table of contents">
        {hierarchy.map((item) => (
          <TocItemComponent
            key={item.id}
            item={item}
            activeId={activeId}
            onItemClick={handleClick}
          />
        ))}
      </nav>
    </div>
  );
}
