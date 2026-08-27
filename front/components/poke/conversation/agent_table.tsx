import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeListConversationItem } from "@app/lib/api/poke/conversations";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeAgentConversations } from "@app/poke/swr/conversation";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Chip, IconButton, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

const PAGE_SIZE = 25;

interface ConversationAgentDataTableProps {
  owner: LightWorkspaceType;
  agentId: string;
}

const makeColumnsForConversations = (
  owner: LightWorkspaceType
): ColumnDef<PokeListConversationItem>[] => {
  return [
    {
      accessorKey: "sId",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Conversation ID</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
      cell: ({ row }) => {
        const conversation = row.original;
        return (
          <LinkWrapper
            href={`/poke/${owner.sId}/conversation/${conversation.sId}`}
          >
            {conversation.sId}
          </LinkWrapper>
        );
      },
    },
    {
      accessorKey: "created",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Created at</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
      cell: ({ row }) => {
        return formatTimestampToFriendlyDate(row.original.created);
      },
    },
    {
      accessorKey: "title",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Title</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "visibility",
      header: "Status",
      cell: ({ row }) => {
        if (row.original.visibility === "deleted") {
          return <Chip color="warning" label="Deleted" size="xs" />;
        }
        return null;
      },
    },
  ];
};

export function ConversationAgentDataTable({
  owner,
  agentId,
}: ConversationAgentDataTableProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const useConversationsWithAgent = (props: PokeConditionalFetchProps) =>
    usePokeAgentConversations({ ...props, agentId, limit });

  return (
    <PokeDataTableConditionalFetch
      header="Conversations"
      owner={owner}
      useSWRHook={useConversationsWithAgent}
    >
      {({ conversations, hasMore, isLoadingMore }) => (
        <div className="flex flex-col gap-3">
          <PokeDataTable<PokeListConversationItem, unknown>
            columns={makeColumnsForConversations(owner)}
            data={conversations}
            pageSize={PAGE_SIZE}
          />
          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                label="Load more"
                isLoading={isLoadingMore}
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
              />
            </div>
          )}
        </div>
      )}
    </PokeDataTableConditionalFetch>
  );
}
