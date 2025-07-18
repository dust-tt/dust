import { IconButton, TrashIcon } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type {
  DataSourceType,
  SlackAutoReadPattern,
  SpaceType,
} from "@app/types";

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
  dataSource: DataSourceType;
  onDelete: (pattern: SlackAutoReadPattern) => Promise<void>;
  spaces: SpaceType[];
}

export function SlackAutoReadPatternsTable({
  autoReadPatterns,
  dataSource,
  onDelete,
  spaces,
}: SlackAutoReadPatternsTableProps) {
  const tableTitle =
    dataSource.connectorProvider === "slack"
      ? "Slack Auto Read Patterns"
      : "Slack Bot Auto Join Channels Patterns";

  return (
    <div className="border-material-200 my-4 flex min-h-48 flex-col rounded-lg border bg-muted-background dark:bg-muted-background-night">
      <div className="flex justify-between gap-3 rounded-t-lg bg-primary-300 p-4 dark:bg-primary-300-night">
        <h2 className="text-md font-bold">{tableTitle}</h2>
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
