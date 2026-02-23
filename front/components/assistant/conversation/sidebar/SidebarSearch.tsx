import { SearchInput } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

interface SidebarSearchProps {
  titleFilter: string;
  onTitleFilterChange: (value: string) => void;
}

export function SidebarSearch({
  titleFilter,
  onTitleFilterChange,
}: SidebarSearchProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        searchInputRef.current?.focus();
      }
      if (
        e.key === "Escape" &&
        document.activeElement === searchInputRef.current
      ) {
        e.preventDefault();
        onTitleFilterChange("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onTitleFilterChange]);

  return (
    <SearchInput
      ref={searchInputRef}
      name="search"
      placeholder="Search"
      value={titleFilter}
      onChange={onTitleFilterChange}
    />
  );
}
