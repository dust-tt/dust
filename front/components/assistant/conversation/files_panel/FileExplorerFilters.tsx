import type { FileExplorerFilter } from "@app/components/assistant/conversation/files_panel/types";
import {
  ActionCodeBlockIcon,
  ActionDocumentTextIcon,
  ActionFolderIcon,
  ActionFrameIcon,
  ActionImageIcon,
  ActionTableIcon,
  Button,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

const FILTER_CHIPS: {
  value: FileExplorerFilter;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "all", label: "All" },
  { value: "tables", label: "Tables", icon: ActionTableIcon },
  { value: "frames", label: "Frames", icon: ActionFrameIcon },
  { value: "texts", label: "Texts", icon: ActionDocumentTextIcon },
  { value: "folders", label: "Folders", icon: ActionFolderIcon },
  { value: "images", label: "Images", icon: ActionImageIcon },
  { value: "code", label: "Code", icon: ActionCodeBlockIcon },
];

interface FileExplorerFiltersProps {
  active: FileExplorerFilter;
  onActiveChange: (v: FileExplorerFilter) => void;
  counts: Partial<Record<FileExplorerFilter, number>>;
}

export function FileExplorerFilters({
  active,
  onActiveChange,
  counts,
}: FileExplorerFiltersProps) {
  // "All" stays pinned first. Remaining chips are sorted by count desc, ties broken by the
  // canonical order defined in FILTER_CHIPS.
  const orderedChips = useMemo(() => {
    const [allChip, ...rest] = FILTER_CHIPS;
    const visible = rest.filter((chip) => (counts[chip.value] ?? 0) > 0);
    visible.sort((a, b) => (counts[b.value] ?? 0) - (counts[a.value] ?? 0));

    return [allChip, ...visible];
  }, [counts]);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {orderedChips.map(({ value, label, icon }) => {
        const count = value === "all" ? undefined : counts[value];
        return (
          <Button
            key={value}
            size="xs"
            variant={active === value ? "primary" : "outline"}
            icon={icon}
            label={label}
            isCounter={count !== undefined}
            counterValue={count !== undefined ? String(count) : undefined}
            onClick={() => onActiveChange(value)}
          />
        );
      })}
    </div>
  );
}
