import { makeColumnsForConversations } from "@app/components/poke/conversation/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeConversationsFetchProps } from "@app/poke/swr/conversation";
import { usePokeConversations } from "@app/poke/swr/conversation";
import type { LightWorkspaceType } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

interface ConversationDataTableProps {
  owner: LightWorkspaceType;
  trigger: TriggerType;
  loadOnInit?: boolean;
}

export function ConversationDataTable({
  owner,
  trigger,
  loadOnInit,
}: ConversationDataTableProps) {
  const useConversationsWithTrigger = (props: PokeConversationsFetchProps) =>
    usePokeConversations({ ...props, triggerId: trigger.sId });

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
