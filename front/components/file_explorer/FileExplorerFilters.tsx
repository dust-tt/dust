import type { FileExplorerFilter } from "@app/components/file_explorer/types";
import { Button } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

const FILTER_CHIPS: {
  value: FileExplorerFilter;
  label: MessageDescriptor;
}[] = [
  { value: "all", label: msg({ message: "All", context: "file filter" }) },
  { value: "nodes", label: msg`Knowledge` },
  { value: "tables", label: msg`Tables` },
  { value: "frames", label: msg`Frames` },
  { value: "texts", label: msg`Texts` },
  { value: "folders", label: msg`Folders` },
  { value: "images", label: msg`Images` },
  { value: "code", label: msg({ message: "Code", context: "file filter" }) },
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
  const { t } = useLingui();
  // "All" stays pinned first. Remaining chips are sorted by count desc, ties broken by the
  // canonical order defined in FILTER_CHIPS.
  const orderedChips = useMemo(() => {
    const [allChip, ...rest] = FILTER_CHIPS;
    const visible = rest.filter((chip) => (counts[chip.value] ?? 0) > 0);
    visible.sort((a, b) => (counts[b.value] ?? 0) - (counts[a.value] ?? 0));

    return [allChip, ...visible];
  }, [counts]);

  // If only one it's "All" so there's nothing to filter against.
  if (orderedChips.length <= 1) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {orderedChips.map(({ value, label }) => {
        const count = value === "all" ? undefined : counts[value];
        return (
          <Button
            key={value}
            size="xs"
            variant={active === value ? "primary" : "outline"}
            label={t(label)}
            isCounter={count !== undefined}
            counterValue={count !== undefined ? String(count) : undefined}
            onClick={() => onActiveChange(value)}
          />
        );
      })}
    </div>
  );
}
