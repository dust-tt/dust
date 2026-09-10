import { ANONYMOUS_USER_IMAGE_URL } from "@app/types/user";
import { cn, DataTable, LoadingBlock } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

// The minimal row shape the name column needs.
interface MemberNameRow {
  name: string;
  email: string | null;
  image: string | null;
}

interface MemberNameSkeletonProps {
  rowIndex: number;
}

export function MemberNameSkeleton({ rowIndex }: MemberNameSkeletonProps) {
  return (
    <div className="flex h-9 min-w-0 items-center gap-2">
      <LoadingBlock className="h-7 w-7 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <LoadingBlock
          className={cn(
            "h-3 max-w-full",
            ["w-28", "w-36", "w-24", "w-40", "w-32"][rowIndex % 5]
          )}
        />
        <LoadingBlock className="h-3 w-40 max-w-full" />
      </div>
    </div>
  );
}

export function buildMemberNameColumn<TRow extends MemberNameRow>(): ColumnDef<
  TRow,
  string
> {
  return {
    id: "name" as const,
    header: "Name",
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
