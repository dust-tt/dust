import {
  Avatar,
  AvatarCellSkeleton,
  DataTable,
  TextCellSkeleton,
} from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";
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
    header: () => <Trans>Name</Trans>,
    enableSorting: true,
    accessorFn: (row) => row.name,
    cell: (info: CellContext<TRow, string>) => (
      <DataTable.CellContent
        icon={() => (
          <Avatar
            name={info.row.original.name}
            visual={info.row.original.image ?? undefined}
            className="mr-2"
            size="xs"
            isRounded
          />
        )}
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
