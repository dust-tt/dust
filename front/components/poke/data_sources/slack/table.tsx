import { IconButton, TrashIcon } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { SlackAutoReadPattern, SpaceType } from "@app/types";

function prepareSlackAutoReadPatternsForDisplay(
  patterns: SlackAutoReadPattern[],
  spaces: SpaceType[]
) {
  return patterns.map((p) => {
    return {
      ...p,
      spaceName:
        spaces.find((s) => s.sId === p.spaceId)?.name ??
        `N/A (spaceId: ${p.spaceId})`,
    };
  });
}

type SlackAutoReadPatternRow = SlackAutoReadPattern & {
  spaceName: string;
};

function makeColumnsForSlackAutoReadPatterns(
  onDelete: (pattern: SlackAutoReadPattern) => Promise<void>
): ColumnDef<SlackAutoReadPatternRow>[] {
  return [
    {
      accessorKey: "pattern",
      header: () => {
        return (
          <div className="flex space-x-2">
            <p>Pattern (regex)</p>
          </div>
        );
      },
    },
    {
      accessorKey: "spaceName",
      header: () => {
        return (
          <div className="flex space-x-2">
            <p>Space Name</p>
          </div>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        return (
          <IconButton
            icon={TrashIcon}
            size="xs"
            variant="warning"
            onClick={async () => {
              await onDelete(row.original);
            }}
          />
        );
      },
    },
  ];
}

interface SlackAutoReadPatternsTableProps {
  autoReadPatterns: SlackAutoReadPattern[];
  onDelete: (pattern: SlackAutoReadPattern) => Promise<void>;
  spaces: SpaceType[];
}

export function SlackAutoReadPatternsTable({
  autoReadPatterns,
  onDelete,
  spaces,
}: SlackAutoReadPatternsTableProps) {
  return (
    <div className="border-material-200 my-4 flex min-h-48 flex-col rounded-lg border bg-slate-100">
      <div className="flex justify-between gap-3 rounded-t-lg bg-slate-300 p-4">
        <h2 className="text-md font-bold">Slack Auto Read Patterns :</h2>
      </div>
      <div className="flex flex-grow flex-col justify-center p-4">
        <PokeDataTable
          columns={makeColumnsForSlackAutoReadPatterns(onDelete)}
          data={prepareSlackAutoReadPatternsForDisplay(
            autoReadPatterns,
            spaces
          )}
        />
      </div>
    </div>
  );
}
