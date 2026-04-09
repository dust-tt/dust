import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { REINFORCED_SKILLS_METADATA_KEYS } from "@app/lib/reinforcement/types";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PokeConversationsFetchProps } from "@app/poke/swr/conversation";
import { usePokeConversations } from "@app/poke/swr/conversation";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { IconButton, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

interface ReinforcementSkillsConversationDataTableProps {
  owner: LightWorkspaceType;
  skillId: string;
}

function getOperationTypeLabel(metadata: Record<string, unknown>): string {
  const operationType =
    metadata[REINFORCED_SKILLS_METADATA_KEYS.reinforcedOperationType];

  switch (operationType) {
    case "reinforcement_analyze_conversation":
      return "Analysis";
    case "reinforcement_aggregate_suggestions":
      return "Aggregation";
    default:
      return "Unknown";
  }
}

const makeColumnsForReinforcementSkillsConversations = (
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

export function ReinforcementSkillsConversationDataTable({
  owner,
  skillId,
}: ReinforcementSkillsConversationDataTableProps) {
  const useReinforcementSkillsConversations = (
    props: PokeConversationsFetchProps
  ) => usePokeConversations({ ...props, reinforcedSkillId: skillId });

  return (
    <PokeDataTableConditionalFetch
      header="Reinforcement conversations"
      owner={owner}
      showSensitiveDataWarning={true}
      useSWRHook={useReinforcementSkillsConversations}
    >
      {(conversations) => {
        const columns = makeColumnsForReinforcementSkillsConversations(owner);

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
