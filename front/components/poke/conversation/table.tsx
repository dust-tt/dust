import { makeColumnsForConversations } from "@app/components/poke/conversation/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeConversationsFetchProps } from "@app/poke/swr/conversation";
import { usePokeConversations } from "@app/poke/swr/conversation";
import type { LightWorkspaceType } from "@app/types";

interface ConversationDataTableProps {
  owner: LightWorkspaceType;
  triggerId: string;
  loadOnInit?: boolean;
}

export function ConversationDataTable({
  owner,
  triggerId,
  loadOnInit,
}: ConversationDataTableProps) {
  const useConversationsWithTrigger = (props: PokeConversationsFetchProps) =>
    usePokeConversations({ ...props, triggerId });

  return (
    <PokeDataTableConditionalFetch
      header="Conversations"
      owner={owner}
      loadOnInit={loadOnInit}
      showSensitiveDataWarning={true}
      useSWRHook={useConversationsWithTrigger}
    >
      {(conversations) => (
        <PokeDataTable
          columns={makeColumnsForConversations(owner)}
          data={conversations}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
