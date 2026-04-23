import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { REINFORCEMENT_METADATA_KEYS } from "@app/lib/reinforced_agent/types";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PokeConversationsFetchProps } from "@app/poke/swr/conversation";
import { usePokeConversations } from "@app/poke/swr/conversation";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { IconButton, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

interface ReinforcementConversationDataTableProps {
  owner: LightWorkspaceType;
  agentId: string;
}

function getOperationTypeLabel(metadata: Record<string, unknown>): string {
  const operationType =
    metadata[REINFORCEMENT_METADATA_KEYS.reinforcedOperationType];

  switch (operationType) {
    case "reinforced_agent_analyze_conversation":
      return "Analysis";
    case "reinforced_agent_aggregate_suggestions":
      return "Aggregation";
    default:
      return "Unknown";
  }
}

const makeColumnsForReinforcementConversations = (
  owner: LightWorkspaceType
): ColumnDef<ConversationWithoutContentType>[] => {
  return [
    {
      accessorKey: "sId",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Id</p>
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
      id: "operationType",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Type</p>
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
      accessorFn: (row) => getOperationTypeLabel(row.metadata),
    },
  ];
};

export function ReinforcementConversationDataTable({
  owner,
  agentId,
}: ReinforcementConversationDataTableProps) {
  const useReinforcementConversations = (props: PokeConversationsFetchProps) =>
    usePokeConversations({ ...props, reinforcedAgentId: agentId });

  return (
    <PokeDataTableConditionalFetch
      header="Reinforcement conversations"
      owner={owner}
      showSensitiveDataWarning={true}
      useSWRHook={useReinforcementConversations}
    >
      {(conversations) => {
        const columns = makeColumnsForReinforcementConversations(owner);

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
