import type { GroupRow } from "@app/components/workspace/member_spend_limit_helpers";
import { DataTable, Input } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

interface MemberGroupLimitTableProps {
  rows: GroupRow[];
  readOnly: boolean;
  groupLimitInputs: Record<string, string>;
  groupValidationMessages: Record<string, string | null>;
  onChange: (groupId: string, cleaned: string) => void;
}

export function MemberGroupLimitTable({
  rows,
  readOnly,
  groupLimitInputs,
  groupValidationMessages,
  onChange,
}: MemberGroupLimitTableProps) {
  const groupColumns: ColumnDef<GroupRow, string>[] = [
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
      cell: ({ row }) => {
        const groupId = row.original.groupId;
        const draft = groupLimitInputs[groupId] ?? "";
        const message = groupValidationMessages[groupId] ?? null;
        return (
          <Input
            size="sm"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="No limit"
            disabled={readOnly}
            value={draft !== "" ? Number(draft).toLocaleString() : ""}
            onChange={(e) => {
              onChange(groupId, e.target.value.replace(/[^\d]/g, ""));
            }}
            isError={message !== null}
            message={message ?? undefined}
            messageStatus={message !== null ? "error" : undefined}
            suffix="credits/m."
            isUnit
          />
        );
      },
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

  return (
    <div className="overflow-x-auto">
      <DataTable data={rows} columns={groupColumns} />
    </div>
  );
}
