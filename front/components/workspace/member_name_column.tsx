import { ANONYMOUS_USER_IMAGE_URL } from "@app/types/user";
import {
  AvatarCellSkeleton,
  DataTable,
  TextCellSkeleton,
} from "@dust-tt/sparkle";
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
    <AvatarCellSkeleton rounded className="h-9">
      <TextCellSkeleton
        className={["w-28", "w-36", "w-24", "w-40", "w-32"][rowIndex % 5]}
      />
      <TextCellSkeleton className="w-40" />
    </AvatarCellSkeleton>
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
