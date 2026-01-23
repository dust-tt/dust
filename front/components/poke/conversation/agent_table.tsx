import { IconButton, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PokeConversationsFetchProps } from "@app/poke/swr/conversation";
import { usePokeConversations } from "@app/poke/swr/conversation";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

interface ConversationAgentDataTableProps {
  owner: LightWorkspaceType;
  agentId: string;
}

const makeColumnsForConversations = (
  owner: LightWorkspaceType
): ColumnDef<ConversationWithoutContentType>[] => {
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
  ];
};

export function ConversationAgentDataTable({
  owner,
  agentId,
}: ConversationAgentDataTableProps) {
  const useConversationsWithAgent = (props: PokeConversationsFetchProps) =>
    usePokeConversations({ ...props, agentId });

  return (
    <PokeDataTableConditionalFetch
      header="Conversations"
      owner={owner}
      showSensitiveDataWarning={true}
      useSWRHook={useConversationsWithAgent}
    >
      {(conversations) => {
        const columns = makeColumnsForConversations(owner);

        return (
          <PokeDataTable<ConversationWithoutContentType, unknown>
            columns={columns}
            data={conversations}
          />
        );
      }}
    </PokeDataTableConditionalFetch>
  );
}
