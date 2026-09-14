import { IconButton } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { Column } from "@tanstack/react-table";

interface PokeColumnSortableHeaderProps<TData> {
  column: Column<TData, unknown>;
  label: string;
}

export function PokeColumnSortableHeader<TData>({
  column,
  label,
}: PokeColumnSortableHeaderProps<TData>) {
  const sorted = column.getIsSorted();
  const nextDirection = sorted === "asc" ? "descending" : "ascending";

  return (
    <div className="flex items-center space-x-2">
      <p>{label}</p>
      <IconButton
        aria-label={`Sort ${label} ${nextDirection}`}
        variant="outline"
        icon={ArrowsUpDownIcon}
        onClick={() => column.toggleSorting(sorted === "asc")}
      />
    </div>
  );
}
