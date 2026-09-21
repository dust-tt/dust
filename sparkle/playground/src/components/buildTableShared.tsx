import {
  Button,
  Checkbox,
  Chip,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Label,
  PuzzlePiece01,
  Robot,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  HeaderContext,
} from "@tanstack/react-table"; // prettier-ignore

// The pieces the Build tables share: the checkbox column that feeds the bulk
// bar, the filter menus above the table, the dialog a destructive batch action
// goes through, and the "Used by" cell. Tools only borrows the last one — it
// has no selection in the product either.

/** The minimum a row needs for the checkbox to label itself. */
type SelectableRow = { id: string; name: string };

/**
 * The leading checkbox column. Its header ticks the current page and unticks
 * the whole selection, since a selection can outlive the page it was made on.
 */
export function buildSelectionColumn<TData extends SelectableRow>(
  itemLabel: string
): ColumnDef<TData, unknown> {
  return {
    id: "select",
    enableSorting: false,
    header: (info: HeaderContext<TData, unknown>) => {
      const rows = info.table.getRowModel().rows;
      const allSelected = info.table.getIsAllPageRowsSelected();
      const someSelected = rows.some((row) => row.getIsSelected());

      return (
        <DataTable.CellContent className="size-full items-center justify-center">
          <Checkbox
            checked={allSelected ? true : someSelected ? "partial" : false}
            disabled={!rows.some((row) => row.getCanSelect())}
            tooltip={allSelected ? "Clear selection" : "Select all on page"}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(checked) => {
              if (checked) {
                info.table.toggleAllPageRowsSelected(true);
              } else {
                info.table.resetRowSelection();
              }
            }}
          />
        </DataTable.CellContent>
      );
    },
    cell: (info: CellContext<TData, unknown>) => {
      const checkboxId = `select-${itemLabel}-${info.row.id}`;
      const { name } = info.row.original;

      // The label makes the whole cell a hit target; stopping the click keeps
      // it from also reaching the row and opening the sheet.
      return (
        <Label
          htmlFor={checkboxId}
          className="flex size-full cursor-pointer items-center justify-center hover:bg-muted-background"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Checkbox
            id={checkboxId}
            aria-label={
              info.row.getIsSelected() ? `Deselect ${name}` : `Select ${name}`
            }
            checked={info.row.getIsSelected()}
            disabled={!info.row.getCanSelect()}
            onCheckedChange={(checked) => info.row.toggleSelected(!!checked)}
          />
        </Label>
      );
    },
    meta: { className: "w-10 p-0" },
  };
}

/** A multi-select filter over one column, echoed as removable chips below it. */
export function FilterMenu({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          isSelect
          label={selected.length > 0 ? `${label} (${selected.length})` : label}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel label={label} />
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            label={option.label}
            // Keeping the menu open lets several filters be ticked at once.
            onClick={(event) => {
              event.preventDefault();
              onChange(
                selected.includes(option.value)
                  ? selected.filter((value) => value !== option.value)
                  : [...selected, option.value]
              );
            }}
            endComponent={
              selected.includes(option.value) ? (
                <Chip size="mini" color="highlight" label="On" />
              ) : undefined
            }
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function countLabelFor(count: number, noun: string): string | null {
  return count > 0 ? `${count} ${noun}${count === 1 ? "" : "s"}` : null;
}

/**
 * The "Used by" cell: a robot carrying the number of agents, and a puzzle
 * carrying the number of skills whenever a skill reaches for the row. The
 * counts speak for themselves, so only the screen reader gets the nouns.
 */
export function UsedByCell({
  agentCount,
  skillCount = 0,
}: {
  agentCount: number;
  /** Leave it out where only agents can use the row, as for a skill. */
  skillCount?: number;
}) {
  const hasSkills = skillCount > 0;
  const label =
    [countLabelFor(agentCount, "agent"), countLabelFor(skillCount, "skill")]
      .filter((part) => part !== null)
      .join(" and ") || "0 agents";

  return (
    <div className="flex h-12 w-full items-center justify-center">
      <Button
        size="xs"
        variant="ghost-secondary"
        // The robot, its count and the puzzle outgrow the icon-only width.
        className="w-auto px-2"
        disabled={agentCount + skillCount === 0}
        aria-label={`Used by ${label}`}
        icon={
          <span className="flex h-5 items-center gap-1.5 leading-none">
            {/* Without skills the robot stands in for an empty row too. */}
            {(agentCount > 0 || !hasSkills) && (
              <span className="inline-flex items-center gap-1">
                <Robot className="h-4 w-4 shrink-0" />
                <span className="text-sm tabular-nums">{agentCount}</span>
              </span>
            )}
            {hasSkills && (
              <span className="inline-flex items-center gap-1">
                <PuzzlePiece01 className="h-4 w-4 shrink-0" />
                <span className="text-sm tabular-nums">{skillCount}</span>
              </span>
            )}
          </span>
        }
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

export type BatchConfirmCopy = {
  title: string;
  body: string;
  confirmLabel: string;
  isWarning?: boolean;
};

/**
 * The confirmation a batch action goes through, so a bar that can archive
 * thirty rows at once never does it on a single click.
 */
export function BatchConfirmDialog({
  copy,
  countLabel,
  onCancel,
  onConfirm,
}: {
  /** Null while nothing is pending, which is also what closes the dialog. */
  copy: BatchConfirmCopy | null;
  countLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={copy !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent size="md">
        {copy && (
          <>
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              <DialogDescription className="text-foreground">
                {countLabel} selected. {copy.body}
              </DialogDescription>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{ label: "Cancel", variant: "outline" }}
              rightButtonProps={{
                label: copy.confirmLabel,
                variant: copy.isWarning ? "warning" : "highlight",
                onClick: onConfirm,
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
