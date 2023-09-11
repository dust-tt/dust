import { Button, ChatBubbleBottomCenterPlusIcon, Item } from "@dust-tt/sparkle";
import { PlanetIcon } from "@dust-tt/sparkle";
import { useRouter } from "next/router";

import { ChatSessionType } from "@app/types/chat";
import { WorkspaceType } from "@app/types/user";

export function ChatSidebarMenu({
  owner,
  sessions,
  canStartConversation,
  readOnly,
}: {
  owner: WorkspaceType;
  sessions: ChatSessionType[];
  canStartConversation: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();

  const onNewConversation = async () => {
    void router.push(`/w/${owner.sId}/u/chat`);
  };

  return (
    <div className="flex grow flex-col px-2">
      <div className="flex border-b border-structure-200 py-2 pl-2">
        <Item
          size="md"
          selected={readOnly}
          label="Workspace Conversations"
          icon={PlanetIcon}
          href={`/w/${owner.sId}/u/chats`}
          className="flex-grow"
        ></Item>
      </div>
      <div className="flex h-0 min-h-full w-full overflow-y-auto">
        <div className="flex w-full flex-col pl-2">
          <div className="pr py-4 text-right">
            <Button
              disabled={!canStartConversation}
              labelVisible={true}
              label="New Conversation"
              icon={ChatBubbleBottomCenterPlusIcon}
              onClick={onNewConversation}
              className="flex-none shrink"
            />
          </div>
          {sessions.length > 0 && (
            <div className="py-1 text-xs uppercase text-slate-400">
              <Item.SectionHeader label="Past Conversations" />
            </div>
          )}
          <Item.List>
            {sessions.length === 0
              ? null
              : sessions.map((s) => {
                  return (
                    <Item
                      key={s.sId}
                      size="sm"
                      selected={router.query.cId === s.sId}
                      label={s.title || ""}
                      href={`/w/${owner.sId}/u/chat/${s.sId}`}
                    ></Item>
                  );
                })}
          </Item.List>
        </div>
      </div>
    </div>
  );
}
