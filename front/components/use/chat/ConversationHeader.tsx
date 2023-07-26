import {
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";

import { timeAgoFrom } from "@app/lib/utils";
import { ChatSessionType } from "@app/types/chat";
import { UserType, WorkspaceType } from "@app/types/user";

const handleTrashClick = async ({
  event,
  conversation,
  owner,
  callback,
}: {
  event: React.MouseEvent<HTMLDivElement, MouseEvent>;
  conversation: ChatSessionType;
  owner: WorkspaceType;
  callback: () => void; // called on successful deletion
}) => {
  event.stopPropagation();
  const confirmed = window.confirm(
    `After deletion, the conversation "${conversation.title}" cannot be recovered. Delete the conversation?`
  );
  if (!confirmed) return false;
  // call the delete API
  const res = await fetch(`/api/w/${owner.sId}/use/chats/${conversation.sId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cId: conversation.sId }),
  });
  if (res.ok) {
    callback();
  } else {
    const data = await res.json();
    window.alert(`Error deleting chat: ${data.error.message}`);
    return false;
  }
};

const handleShareClick = async ({
  event,
  conversation,
  owner,
  callback, // called on successful share toggle
}: {
  event: React.MouseEvent<HTMLDivElement, MouseEvent>;
  conversation: ChatSessionType;
  owner: WorkspaceType;
  callback: () => void;
}) => {
  event.stopPropagation();
  const res = await fetch(
    `/api/w/${owner.sId}/use/chats/${conversation.sId}/shared`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cId: conversation.sId,
        shared: conversation.shared ? false : true,
      }),
    }
  );
  if (res.ok) {
    callback();
  } else {
    const data = await res.json();
    window.alert(`Error sharing chat: ${data.error.message}`);
    return false;
  }
};

export function ConversationHeader({
  user,
  conversation,
  owner,
  trashCallback,
  shareCallback,
}: {
  user: UserType | null;
  conversation: ChatSessionType;
  owner: WorkspaceType;
  trashCallback: () => void;
  shareCallback: () => void;
}) {
  return (
    <div className="flex flex-row items-center">
      <div className="flex flex-1 group-hover:overflow-hidden">
        {conversation.title}
      </div>
      {user?.id === conversation.userId ? (
        <>
          {conversation.shared && (
            <div className="min-w-32 flex flex-initial group-hover:hidden">
              <ArrowUpOnSquareIcon className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-32 hidden flex-initial group-hover:flex">
            <div
              className="ml-1 flex rounded border p-1 hover:border-violet-800 hover:text-violet-800"
              onClick={(event) =>
                handleTrashClick({
                  event,
                  conversation,
                  owner,
                  callback: trashCallback,
                })
              }
            >
              <TrashIcon className="h-4 w-4" />
            </div>
            <div
              className="ml-1 flex flex-row rounded border p-1 hover:border-violet-800 hover:text-violet-800"
              onClick={(event) =>
                handleShareClick({
                  event,
                  conversation,
                  owner,
                  callback: shareCallback,
                })
              }
            >
              {conversation.shared ? (
                <>
                  <ArrowDownOnSquareIcon className="h-4 w-4" />
                  <span>Unshare</span>
                </>
              ) : (
                <>
                  <ArrowUpOnSquareIcon className="h-4 w-4" />
                  <span>Share</span>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        ""
      )}
      <div className="min-w-16 ml-1 flex flex-initial rounded border border-transparent px-1 py-1.5">
        <span className="ml-2 text-xs italic text-gray-400">
          {timeAgoFrom(conversation.created)} ago
        </span>
      </div>
    </div>
  );
}
