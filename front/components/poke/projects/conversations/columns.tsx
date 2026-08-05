import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

export function makeColumnsForProjectConversations(
  owner: LightWorkspaceType
): ColumnDef<PodConversationListItemType>[] {
  return [
    {
      accessorKey: "id",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
      cell: ({ row }) => (
        <LinkWrapper
          href={`/poke/${owner.sId}/conversation/${row.original.id}`}
        >
          {row.original.id}
        </LinkWrapper>
      ),
    },
    {
      accessorKey: "updated",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Updated at" />
      ),
      cell: ({ row }) => formatTimestampToFriendlyDate(row.original.updated),
    },
    {
      accessorKey: "title",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Title" />
      ),
    },
    {
      id: "creator",
      accessorFn: (conversation) => conversation.creator?.name ?? "",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Creator" />
      ),
      cell: ({ row }) => row.original.creator?.name ?? "—",
    },
    {
      accessorKey: "replyCount",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Replies" />
      ),
    },
  ];
}
