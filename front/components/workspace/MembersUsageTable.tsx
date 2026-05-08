import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { DataTable, LoadingBlock } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

type RowData = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
  consumedMicroUsd: number;
  onClick?: () => void;
};

type Info = CellContext<RowData, string>;

function formatMicroUsd(amountMicroUsd: number): string {
  const dollars = amountMicroUsd / 1_000_000;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const columns: ColumnDef<RowData, string>[] = [
  {
    id: "name" as const,
    header: "Name",
    accessorFn: (row) => row.name,
    cell: (info: Info) => (
      <DataTable.CellContent
        avatarUrl={info.row.original.image ?? undefined}
        roundedAvatar
      >
        <div>
          <div>{info.row.original.name}</div>
          {info.row.original.email && (
            <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              {info.row.original.email}
            </div>
          )}
        </div>
      </DataTable.CellContent>
    ),
  },
  {
    id: "consumedMicroUsd" as const,
    header: "Workspace usage",
    accessorFn: (row) => row.consumedMicroUsd.toString(),
    cell: (info: Info) => (
      <DataTable.CellContent>
        <span className="text-sm tabular-nums text-muted-foreground dark:text-muted-foreground-night">
          {formatMicroUsd(info.row.original.consumedMicroUsd)}
        </span>
      </DataTable.CellContent>
    ),
    meta: {
      className: "w-36 text-right",
    },
    enableSorting: true,
    sortingFn: (a, b) =>
      a.original.consumedMicroUsd - b.original.consumedMicroUsd,
  },
];

interface MembersUsageTableProps {
  members: MemberUsageType[];
  isLoading: boolean;
  searchTerm: string;
}

export function MembersUsageTable({
  members,
  isLoading,
  searchTerm,
}: MembersUsageTableProps) {
  if (isLoading) {
    return (
      <div className="flex w-full flex-col space-y-2">
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
      </div>
    );
  }

  const lowerSearch = searchTerm.toLowerCase();
  const filtered = searchTerm
    ? members.filter(
        (m) =>
          m.name.toLowerCase().includes(lowerSearch) ||
          (m.email ?? "").toLowerCase().includes(lowerSearch)
      )
    : members;

  const rows: RowData[] = filtered.map((m) => ({
    sId: m.sId,
    name: m.name,
    email: m.email,
    image: m.image,
    consumedMicroUsd: m.consumedMicroUsd,
  }));

  return <DataTable data={rows} columns={columns} />;
}
