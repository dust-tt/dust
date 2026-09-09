import { CreditLimitNumberInput } from "@app/components/workspace/CreditLimitInput";
import type { GroupRow } from "@app/components/workspace/member_spend_limit_helpers";
import { DataTable } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

interface MemberGroupLimitTableProps {
  rows: GroupRow[];
  readOnly: boolean;
  groupLimitInputs: Record<string, string>;
  groupValidationMessages: Record<string, string | null>;
  onChange: (groupId: string, cleaned: string) => void;
}

type GroupLimitRow = GroupRow & {
  draft: string;
  validationMessage: string | null;
  readOnly: boolean;
  onDraftChange: (cleaned: string) => void;
};

// Column definitions live at module scope because the table renders each
// `cell` function as a component type: a new identity per render would remount
// the input on every keystroke and drop focus.
const groupColumns: ColumnDef<GroupLimitRow, string>[] = [
  {
    id: "name",
    header: "Group",
    accessorFn: (row) => row.name,
    cell: ({ row }) => (
      <DataTable.CellContent
        className={
          row.original.isHighest
            ? "font-semibold text-highlight-500"
            : undefined
        }
      >
        {row.original.name}
      </DataTable.CellContent>
    ),
  },
  {
    id: "poolCapAwuCredits",
    header: "Limit",
    accessorFn: (row) => String(row.poolCapAwuCredits ?? ""),
    meta: { className: "w-48" },
    cell: ({ row }) => (
      <CreditLimitNumberInput
        value={row.original.draft}
        readOnly={row.original.readOnly}
        validationMessage={row.original.validationMessage}
        onChange={row.original.onDraftChange}
        suffix="credits/m."
      />
    ),
  },
  {
    id: "memberCount",
    header: "Members",
    accessorFn: (row) => row.memberCount.toString(),
    meta: { headerAlign: "right" },
    cell: ({ row }) => (
      <DataTable.BasicCellContent
        label={row.original.memberCount.toLocaleString()}
        className="justify-end"
      />
    ),
  },
];

export function MemberGroupLimitTable({
  rows,
  readOnly,
  groupLimitInputs,
  groupValidationMessages,
  onChange,
}: MemberGroupLimitTableProps) {
  const data: GroupLimitRow[] = rows.map((row) => ({
    ...row,
    draft: groupLimitInputs[row.groupId] ?? "",
    validationMessage: groupValidationMessages[row.groupId] ?? null,
    readOnly,
    onDraftChange: (cleaned) => onChange(row.groupId, cleaned),
  }));

  return (
    <div className="overflow-x-auto">
      <DataTable data={data} columns={groupColumns} />
    </div>
  );
}
