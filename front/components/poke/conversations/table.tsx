import { makeColumnsForConversations } from "@app/components/poke/conversations/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

export function ConversationDataTable({
  owner,
  conversations,
}: {
  owner: LightWorkspaceType;
  conversations: ConversationWithoutContentType[];
}) {
  const columns = makeColumnsForConversations(owner);

  return (
    <PokeDataTable<ConversationWithoutContentType, unknown>
      columns={columns}
      data={conversations}
    />
  );
}
