import { makeColumnsForConversations } from "@app/components/poke/conversation/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

interface ConversationDataTableProps {
  owner: LightWorkspaceType;
  conversations: ConversationWithoutContentType[];
}

export function ConversationDataTable({
  owner,
  conversations,
}: ConversationDataTableProps) {
  const columns = makeColumnsForConversations(owner);

  return (
    <PokeDataTable<ConversationWithoutContentType, unknown>
      columns={columns}
      data={conversations}
    />
  );
}
