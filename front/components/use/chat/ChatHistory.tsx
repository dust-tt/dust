import { useChatSessions } from "@app/lib/swr";
import { ChatSessionType } from "@app/types/chat";
import { WorkspaceType } from "@app/types/user";
import { TrashIcon } from "@heroicons/react/20/solid";
import { UserIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import {
  UserIcon as UserIconFull,
  UserGroupIcon as UserGroupIconFull,
} from "@heroicons/react/24/solid";

import { useRouter } from "next/router";
import { useState } from "react";
import { classNames, timeAgoFrom } from "@app/lib/utils";

export function ChatHistory({ owner }: { owner: WorkspaceType }) {
  const router = useRouter();

  const [limit] = useState(10);
  const [workspaceScope, setWorkspaceScope] = useState<boolean>(false);
  const [offset, setOffset] = useState(0);
  const { sessions, mutateChatSessions } = useChatSessions(owner, {
    limit,
    offset,
    workspaceScope,
  });

  const handlePagination = async (newer: boolean) => {
    if (newer) {
      setOffset(offset - limit);
    } else {
      setOffset(offset + limit);
    }
  };

  function PaginationLink({ newer }: { newer: boolean }) {
    const text = newer ? "< newer" : "older >";
    const disabled = newer ? offset === 0 : sessions.length < limit;
    return (
      <div
        className={
          disabled
            ? "text-gray-400 hover:cursor-default"
            : "cursor-pointer hover:text-violet-800"
        }
        onClick={() => disabled || handlePagination(newer)}
      >
        {text}
      </div>
    );
  }

  const handleTrashClick = async (
    event: React.MouseEvent<SVGSVGElement, MouseEvent>,
    chatSession: ChatSessionType
  ) => {
    event.stopPropagation();
    const confirmed = window.confirm(
      `After deletion, the conversation "${chatSession.title}" cannot be recovered. Delete the conversation?`
    );
    if (confirmed) {
      // call the delete API
      const res = await fetch(
        `/api/w/${owner.sId}/use/chats/${chatSession.sId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cId: chatSession.sId }),
        }
      );
      if (res.ok) {
        void mutateChatSessions();
      } else {
        const data = await res.json();
        window.alert(`Error deleting chat: ${data.error.message}`);
      }
    }
    return false;
  };

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-row items-center justify-between pt-4">
        <PaginationLink newer={true} />
        <div className="font-bold">Recent Chats</div>
        <PaginationLink newer={false} />
      </div>
      <div className="flex flex-row items-center justify-center pb-4 pt-1 text-xs italic">
        <div
          className={classNames(
            "group relative",
            !workspaceScope
              ? "font-bold"
              : "cursor-pointer hover:text-violet-800"
          )}
          onClick={() => setWorkspaceScope(false)}
        >
          {!workspaceScope ? (
            <UserIconFull className="w4 h-4" />
          ) : (
            <UserIcon className="h-4 w-4" />
          )}
          <div className="absolute hidden w-max rounded border bg-white px-1 py-1 group-hover:block">
            <span className="font-normal text-gray-600">
              <span className="font-semibold">User history</span>
              &nbsp; Display your chat sessions
            </span>
          </div>
        </div>
        <div
          className={classNames(
            "group relative ml-2",
            workspaceScope
              ? "font-bold"
              : "cursor-pointer hover:text-violet-800"
          )}
          onClick={() => setWorkspaceScope(true)}
        >
          {workspaceScope ? (
            <UserGroupIconFull className="w4 h-4" />
          ) : (
            <UserGroupIcon className="h-4 w-4" />
          )}
          <div className="absolute hidden w-max rounded border bg-white px-1 py-1 group-hover:block">
            <span className="font-normal text-gray-600">
              <span className="font-semibold">Workspace history</span>
              &nbsp; Display chat sessions from other users of this workspace
            </span>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-col space-y-2">
        {sessions.length === 0
          ? "No chat sessions to show there yet."
          : sessions.map((s, i) => {
              return (
                <div
                  key={i}
                  className="group flex w-full cursor-pointer flex-col rounded-md border px-2 py-2 hover:bg-gray-50"
                  onClick={() => {
                    void router.push(`/w/${owner.sId}/u/chat/${s.sId}`);
                  }}
                >
                  <div className="flex flex-row items-center">
                    <div className="flex flex-1">{s.title}</div>
                    <div className="min-w-16 flex flex-initial">
                      <TrashIcon
                        className="ml-1 hidden h-4 w-4 hover:text-violet-800 group-hover:inline-block"
                        onClick={(e) => handleTrashClick(e, s)}
                      ></TrashIcon>
                      <span className="ml-2 text-xs italic text-gray-400">
                        {timeAgoFrom(s.created)} ago
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
