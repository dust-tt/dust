import { classNames } from "@app/lib/utils";
import type { TocItem } from "@app/lib/contentful/tableOfContents";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

    // Remove items from stack that are at same or higher level
    while (
      stack.length > 0 &&
      stack[stack.length - 1].level >= item.level
    ) {
      stack.pop();
    }

    if (stack.length === 0) {
      // Top-level item
      result.push(itemWithChildren);
    } else {
      // Child of the last item in stack
      stack[stack.length - 1].children.push(itemWithChildren);
    }

    stack.push(itemWithChildren);
  }

  return result;
}

export function TableOfContents({ items, className }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const headingsRef = useRef<Map<string, HTMLElement>>(new Map());
  const activeIdRef = useRef<string>("");
  const setupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Update headings map when items change
  useEffect(() => {
    headingsRef.current.clear();
    items.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        headingsRef.current.set(item.id, element);
      }
    });
  }, [items]);

  // Find the active heading based on scroll position
  const findActiveHeading = useCallback(() => {
    if (isScrollingRef.current || headingsRef.current.size === 0) {
      return;
    }

    const headerOffset = 120;
    const scrollPosition = window.scrollY + headerOffset;

    // Find all headings and their positions
    const headingPositions = Array.from(headingsRef.current.entries())
      .map(([id, element]) => ({
        id,
        element,
        top: element.getBoundingClientRect().top + window.scrollY,
      }))
      .sort((a, b) => a.top - b.top);

    // Find the heading that's currently in view
    let activeHeadingId = "";
    for (let i = headingPositions.length - 1; i >= 0; i--) {
      const heading = headingPositions[i];
      if (heading.top <= scrollPosition + 50) {
        activeHeadingId = heading.id;
        break;
      }
    }

    // If no heading found, use the first one
    if (!activeHeadingId && headingPositions.length > 0) {
      activeHeadingId = headingPositions[0].id;
    }

    // Only update if different from current
    if (activeHeadingId && activeHeadingId !== activeIdRef.current) {
      setActiveId(activeHeadingId);
    }
  }, []); // No dependencies to prevent loops

  // Setup IntersectionObserver - only when items change
  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    // Clear any existing timeout
    if (setupTimeoutRef.current) {
      clearTimeout(setupTimeoutRef.current);
    }

    // Wait for DOM to be ready
    setupTimeoutRef.current = setTimeout(() => {
      // Clean up existing observer
      if (observerRef.current) {
        headingsRef.current.forEach((element) => {
          observerRef.current?.unobserve(element);
        });
        observerRef.current.disconnect();
      }

      const observer = new IntersectionObserver(
        (entries) => {
          // Skip if scrolling programmatically
          if (isScrollingRef.current) {
            return;
          }

          // Find the heading that's most visible in the viewport
          let mostVisible: { entry: IntersectionObserverEntry; ratio: number } | null = null;

          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const ratio = entry.intersectionRatio;
              if (!mostVisible || ratio > mostVisible.ratio) {
                mostVisible = { entry, ratio };
              }
            }
          });

          // Also check headings that are above the viewport but close
          if (!mostVisible) {
            entries.forEach((entry) => {
              const rect = entry.boundingClientRect;
              if (rect.top < 150 && rect.bottom > 0) {
                if (!mostVisible || rect.top > mostVisible.entry.boundingClientRect.top) {
                  mostVisible = { entry, ratio: 0.5 };
                }
              }
            });
          }

          // Only update if different from current
          if (mostVisible) {
            const newActiveId = mostVisible.entry.target.id;
            if (newActiveId && newActiveId !== activeIdRef.current) {
              setActiveId(newActiveId);
            }
          }
        },
        {
          rootMargin: "-100px 0% -50% 0%",
          threshold: [0, 0.1, 0.5, 1],
        }
      );

      observerRef.current = observer;

      // Observe all headings
      headingsRef.current.forEach((element) => {
        observer.observe(element);
      });

      // Set initial active heading
      findActiveHeading();
    }, 200);

    // Scroll event handler with debounce
    const handleScroll = () => {
      if (isScrollingRef.current) {
        return;
      }

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        findActiveHeading();
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (setupTimeoutRef.current) {
        clearTimeout(setupTimeoutRef.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      window.removeEventListener("scroll", handleScroll);
      if (observerRef.current) {
        headingsRef.current.forEach((element) => {
          observerRef.current?.unobserve(element);
        });
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [items, findActiveHeading]); // Only depend on items and stable findActiveHeading

  const hierarchy = useMemo(() => buildHierarchy(items), [items]);

  const handleClick = useCallback(
    (itemId: string, e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const element = headingsRef.current.get(itemId);
      if (!element) {
        return;
      }

      // Set flag to prevent observer from updating during scroll
      isScrollingRef.current = true;
      setActiveId(itemId);

      // Calculate offset for fixed header
      const headerOffset = 96;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition =
        elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });

      // Update URL
      window.history.pushState(null, "", `#${itemId}`);

      // Re-enable observer after scroll completes
      setTimeout(() => {
        isScrollingRef.current = false;
        // Don't call findActiveHeading here to avoid loops
      }, 1000);
    },
    [] // No dependencies
  );

  const renderItem = useCallback(
    (item: TocItemWithChildren): React.ReactNode => {
      const isActive = activeId === item.id;
      const hasActiveChild = item.children.some(
        (child) =>
          activeId === child.id ||
          child.children.some((grandchild) => activeId === grandchild.id)
      );
      const shouldShowChildren = isActive || hasActiveChild;

      return (
        <div key={item.id} className="transition-all duration-200">
          <a
            href={`#${item.id}`}
            onClick={(e) => handleClick(item.id, e)}
            className={classNames(
              "block border-l-2 pl-3 py-1 text-sm transition-all duration-200 ease-in-out",
              item.level === 1 && "font-medium",
              item.level === 2 && "ml-4",
              item.level === 3 && "ml-8",
              item.level === 4 && "ml-12",
              isActive
                ? "border-gray-300 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-200"
            )}
          >
            {item.text}
          </a>
          {item.children.length > 0 && (
            <div
              className={classNames(
                "transition-all duration-300 ease-in-out",
                shouldShowChildren
                  ? "max-h-[2000px] opacity-100"
                  : "max-h-0 opacity-0 overflow-hidden"
              )}
            >
              <div className="mt-1 space-y-1 pl-1">
                {item.children.map((child) => renderItem(child))}
              </div>
            </div>
          )}
        </div>
      );
    },
    [activeId, handleClick]
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={classNames(
        "sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto",
        className
      )}
    >
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Table of contents
      </h3>
      <nav className="space-y-1">
        {hierarchy.map((item) => renderItem(item))}
      </nav>
    </div>
  );
}
