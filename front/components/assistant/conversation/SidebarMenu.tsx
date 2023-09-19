import { Button, ChatBubbleBottomCenterPlusIcon, Item } from "@dust-tt/sparkle";
import { useRouter } from "next/router";

import { useConversations } from "@app/lib/swr";
import { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { WorkspaceType } from "@app/types/user";

export function AssistantSidebarMenu({ owner }: { owner: WorkspaceType }) {
  const router = useRouter();

  const onNewConversation = async () => {
    void router.push(`/w/${owner.sId}/assistant/new`);
  };

  const { conversations } = useConversations({ workspaceId: owner.sId });

  return (
    <div className="flex grow flex-col">
      <div className="flex h-0 min-h-full w-full overflow-y-auto">
        <div className="flex w-full flex-col pl-4 pr-2">
          <div className="pr py-4 text-right">
            <Button
              labelVisible={true}
              label="New Conversation"
              icon={ChatBubbleBottomCenterPlusIcon}
              onClick={onNewConversation}
              className="flex-none shrink"
            />
          </div>
          {conversations.length > 0 && (
            <div className="py-1 text-xs uppercase text-slate-400">
              <Item.SectionHeader label="Past Conversations" />
            </div>
          )}
          <Item.List>
            {conversations.length === 0
              ? null
              : conversations.map((c: ConversationWithoutContentType) => {
                  return (
                    <Item
                      key={c.sId}
                      size="sm"
                      selected={router.query.cId === c.sId}
                      label={
                        c.title ||
                        `Conversation from ${new Date(
                          c.created
                        ).toLocaleDateString()}`
                      }
                      href={`/w/${owner.sId}/assistant/${c.sId}`}
                    />
                  );
                })}
          </Item.List>
        </div>
      </div>
    </div>
  );
}
