import { useCallback, useEffect, useState } from "react";

const HEADER_OFFSET = 80;
const SCROLL_DEBOUNCE_MS = 100;

function findActiveHeadingId(items: Array<{ id: string }>): string {
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

export function useScrollSpy(items: Array<{ id: string }>) {
  const [activeId, setActiveId] = useState<string>("");

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

  return { activeId, handleClick };
}
