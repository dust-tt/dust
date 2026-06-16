import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { PokeProjectKnowledgeFromConnectorItem } from "@app/lib/api/poke/projects";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, LinkWrapper, Tooltip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

function sourceCell(
  item: PokeProjectKnowledgeFromConnectorItem,
  owner: LightWorkspaceType
) {
  const label =
    item.sourceDataSourceName ??
    item.sourceConnectorProvider ??
    "unknown source";
  if (!item.sourceDataSourceViewSpaceId) {
    return <span>{label}</span>;
  }
  return (
    <LinkWrapper
      href={`/poke/${owner.sId}/spaces/${item.sourceDataSourceViewSpaceId}/data_source_views/${item.nodeDataSourceViewId}`}
      className="text-highlight-400"
    >
      {label}
    </LinkWrapper>
  );
}

export function makeColumnsForProjectConnectorKnowledge(
  owner: LightWorkspaceType
): ColumnDef<PokeProjectKnowledgeFromConnectorItem>[] {
  return [
    {
      id: "kind",
      cell: ({ row }) => (
        <Chip color="primary" label={row.original.nodeType} size="xs" />
      ),
      header: () => <span>Kind</span>,
    },
    {
      accessorKey: "title",
      cell: ({ row }) => {
        const item = row.original;
        const title = (
          <Tooltip
            label={item.title}
            trigger={
              <span className="line-clamp-2 max-w-md font-medium">
                {item.title}
              </span>
            }
          />
        );
        if (item.sourceUrl) {
          return (
            <LinkWrapper
              href={item.sourceUrl}
              target="_blank"
              className="text-highlight-400"
            >
              {title}
            </LinkWrapper>
          );
        }
        return title;
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Title" />
      ),
    },
    {
      id: "source",
      cell: ({ row }) => sourceCell(row.original, owner),
      header: () => <span>Source</span>,
    },
    {
      accessorKey: "contentType",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.contentType}</span>
      ),
      header: () => <span>Content type</span>,
    },
    {
      accessorKey: "lastUpdatedAt",
      cell: ({ row }) => {
        const ts = row.original.lastUpdatedAt;
        if (!ts) {
          return <span className="text-warning-500">never</span>;
        }
        return formatTimestampToFriendlyDate(ts);
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Last sync / update" />
      ),
    },
    {
      id: "creator",
      cell: ({ row }) => row.original.creator ?? "—",
      header: () => <span>Added by</span>,
    },
    {
      accessorKey: "contentFragmentId",
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.contentFragmentId}
        </span>
      ),
      header: () => <span>Ref</span>,
    },
  ];
}
