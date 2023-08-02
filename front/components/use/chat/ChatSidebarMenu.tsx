import { Button, ChatBubbleBottomCenterPlusIcon, Item } from "@dust-tt/sparkle";
import { UsersIcon } from "@heroicons/react/20/solid";
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
    <div className="flex grow flex-col">
      <div className="flex flex-row px-2">
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
            size="sm"
            selected={readOnly}
            label="Workspace Conversations"
            icon={UsersIcon}
            className="pl-8 pr-4"
            href={`/w/${owner.sId}/u/chats`}
          ></Item>
        </div>
      </div>
      <div className="mt-4 flex h-0 min-h-full grow overflow-y-auto">
        <div className="flex grow flex-col">
          {sessions.length > 0 && (
            <div className="flex flex-row items-center">
              <div className="px-8 py-4 text-xs uppercase text-slate-400">
                Past Conversations
              </div>
            </div>
          )}
          <div className="flex ">
            <div className="flex w-full flex-col">
              {sessions.length === 0
                ? null
                : sessions.map((s) => {
                    return (
                      <Item
                        key={s.sId}
                        size="sm"
                        selected={router.query.cId === s.sId}
                        label={s.title || ""}
                        className="pl-8 pr-4"
                        href={`/w/${owner.sId}/u/chat/${s.sId}`}
                      ></Item>
                    );
                  })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
