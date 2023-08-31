import {
  Button,
  ChatBubbleBottomCenterPlusIcon,
  Item,
  ItemSectionHeader,
  ListItem,
} from "@dust-tt/sparkle";
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
    <div className="flex grow flex-col pl-4 pr-2">
      <div className="flex flex-row">
        <div className="flex grow"></div>
        <Button
          disabled={!canStartConversation}
          labelVisible={true}
          label="New Conversation"
          icon={ChatBubbleBottomCenterPlusIcon}
          onClick={onNewConversation}
          className="flex flex-initial"
        />
      </div>
      <div className="mt-4 flex">
        <div className="flex w-full flex-col">
          <Item
            size="md"
            selected={readOnly}
            label="Workspace Conversations"
            icon={PlanetIcon}
            href={`/w/${owner.sId}/u/chats`}
          ></Item>
        </div>
      </div>
      <div className="mt-4 flex h-0 min-h-full grow overflow-y-auto">
        <div className="flex grow flex-col">
          {sessions.length > 0 && (
            <div className="py-2 text-xs uppercase text-slate-400">
              <ItemSectionHeader label="Past Conversations" />
            </div>
          )}
          <ListItem>
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
          </ListItem>
        </div>
      </div>
    </div>
  );
}
