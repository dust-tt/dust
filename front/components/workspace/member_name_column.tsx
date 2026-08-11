import { ANONYMOUS_USER_IMAGE_URL } from "@app/types/user";
import { DataTable } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

// The minimal row shape the name column needs.
interface MemberNameRow {
  name: string;
  email: string | null;
  image: string | null;
}

export function buildMemberNameColumn<TRow extends MemberNameRow>(
  header = "Name"
): ColumnDef<TRow, string> {
  return {
    id: "name" as const,
    header,
    enableSorting: true,
    accessorFn: (row) => row.name,
    cell: (info: CellContext<TRow, string>) => (
      <DataTable.CellContent
        avatarUrl={info.row.original.image ?? ANONYMOUS_USER_IMAGE_URL}
        roundedAvatar
      >
        <div>
          <div>{info.row.original.name}</div>
          {info.row.original.email &&
            info.row.original.email !== info.row.original.name && (
              <div className="text-xs text-muted-foreground">
                {info.row.original.email}
              </div>
            )}
        </div>
      </DataTable.CellContent>
    ),
  };
}
