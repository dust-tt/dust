import {
  Avatar,
  AvatarCellSkeleton,
  cn,
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

// When the table has a separate email column, it only shows on containers wide enough to fit it.
// Below that width, the email stays stacked under the name instead.
const EMAIL_COLUMN_CLASS_NAME = "hidden @2xl:table-cell";
const STACKED_EMAIL_WITH_EMAIL_COLUMN_CLASS_NAME = "@2xl:hidden";

interface MemberNameColumnOptions {
  hasEmailColumn: boolean;
}

interface MemberNameSkeletonProps extends MemberNameColumnOptions {
  rowIndex: number;
}

export function MemberNameSkeleton({
  rowIndex,
  hasEmailColumn,
}: MemberNameSkeletonProps) {
  return (
    <AvatarCellSkeleton rounded className="h-9">
      <TextCellSkeleton
        className={["w-28", "w-36", "w-24", "w-40", "w-32"][rowIndex % 5]}
      />
      <TextCellSkeleton
        className={cn(
          "w-40",
          hasEmailColumn && STACKED_EMAIL_WITH_EMAIL_COLUMN_CLASS_NAME
        )}
      />
    </AvatarCellSkeleton>
  );
}

export function MemberEmailSkeleton() {
  return <TextCellSkeleton className="w-40" />;
}

export function buildMemberNameColumn<TRow extends MemberNameRow>({
  hasEmailColumn,
}: MemberNameColumnOptions): ColumnDef<TRow, string> {
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
              <div
                className={cn(
                  "text-xs text-muted-foreground",
                  hasEmailColumn && STACKED_EMAIL_WITH_EMAIL_COLUMN_CLASS_NAME
                )}
              >
                {info.row.original.email}
              </div>
            )}
        </div>
      </DataTable.CellContent>
    ),
  };
}

export function buildMemberEmailColumn<TRow extends MemberNameRow>(): ColumnDef<
  TRow,
  string
> {
  return {
    id: "email" as const,
    header: () => <Trans>Email</Trans>,
    enableSorting: false,
    accessorFn: (row) => row.email ?? "",
    cell: (info: CellContext<TRow, string>) => (
      <DataTable.CellContent>
        <span className="text-sm text-muted-foreground">
          {info.row.original.email}
        </span>
      </DataTable.CellContent>
    ),
    meta: {
      className: EMAIL_COLUMN_CLASS_NAME,
    },
  };
}
