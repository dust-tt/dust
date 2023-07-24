import { Menu } from "@headlessui/react";
import { TrashIcon } from "@heroicons/react/20/solid";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/solid";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { useChatSessions } from "@app/lib/swr";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import { ChatSessionType } from "@app/types/chat";
import { UserType, WorkspaceType } from "@app/types/user";

export function ChatHistory({
  owner,
  user,
  limit,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  limit: number;
}) {
  const router = useRouter();
  const [workspaceScope, setWorkspaceScope] = useState<boolean>(false);
  const [offset, setOffset] = useState(0);
  const { sessions, mutateChatSessions } = useChatSessions(owner, {
    limit,
    offset,
    workspaceScope,
  });

  /* Cache the next page, and the inital page of other tab, to avoid page jump &
  lag */
  useChatSessions(owner, {
    limit,
    offset: offset + limit,
    workspaceScope,
  });
  useChatSessions(owner, {
    limit,
    offset,
    workspaceScope: !workspaceScope,
  });

  function ChatSwitcher() {
    const tabs: {
      name: string;
      onClick: React.MouseEventHandler<HTMLAnchorElement>;
    }[] = [
      {
        name: "My Conversations",
        onClick: () => {
          setWorkspaceScope(false);
          setOffset(0);
        },
      },
      {
        name: "Team Conversations",
        onClick: () => {
          setWorkspaceScope(true);
          setOffset(0);
        },
      },
    ];
    const currentTab = workspaceScope
      ? "Team Conversations"
      : "My Conversations";
    const currTab = tabs.find((t) => t.name === currentTab);

    return (
      <div className="w-full">
        <div className="flex-cols mb-2 flex border-b border-gray-200 sm:hidden">
          <div className="flex flex-1">
            <Menu as="div" className="relative w-full">
              <div>
                <Menu.Button className="flex w-full items-center whitespace-nowrap text-sm font-bold text-gray-700 focus:outline-none">
                  <div className="flex flex-initial px-4 py-3">
                    {currTab?.name}
                  </div>
                  <div className="flex">
                    <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                  </div>
                </Menu.Button>
              </div>
              <Menu.Items className="absolute left-0 z-10 mt-0 w-full origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                {tabs.map((tab) => (
                  <Menu.Item key={tab.name}>
                    {({ active }) => (
                      <Link
                        href="#"
                        onClick={tab.onClick}
                        key={tab.name}
                        className={classNames(
                          "flex whitespace-nowrap font-medium",
                          active ? "bg-gray-50" : "",
                          "block px-4 py-3 text-sm text-gray-500"
                        )}
                      >
                        {tab.name}
                      </Link>
                    )}
                  </Menu.Item>
                ))}
              </Menu.Items>
            </Menu>
          </div>
          <div className="flex flex-1"></div>
          <div className="flex flex-initial items-center">
            <PaginationLink newer={true} />
            <PaginationLink newer={false} />
          </div>
        </div>

        <div className="mb-2 hidden sm:block">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex" aria-label="Tabs">
              {tabs.map((tab) => (
                <div key={tab.name} className="flex flex-initial">
                  <Link
                    href="#"
                    onClick={tab.onClick}
                    key={tab.name}
                    className={classNames(
                      "flex flex items-center whitespace-nowrap border-b-2 px-4 py-3 text-sm",
                      tab.name == currentTab
                        ? "border-gray-500 font-bold text-gray-700"
                        : "border-transparent font-medium text-gray-500 hover:border-gray-200 hover:text-gray-700"
                    )}
                  >
                    {tab.name}
                  </Link>
                </div>
              ))}
              <div className="flex flex-1"></div>
              <div className="flex flex-initial items-center">
                <PaginationLink newer={true} />
                <PaginationLink newer={false} />
              </div>
            </nav>
          </div>
        </div>
      </div>
    );
  }

  const handlePagination = async (newer: boolean) => {
    if (newer) {
      setOffset(offset - limit);
    } else {
      setOffset(offset + limit);
    }
  };

  function PaginationLink({ newer }: { newer: boolean }) {
    const disabled = newer ? offset === 0 : sessions.length < limit;
    const invisible = offset === 0 && sessions.length < limit;
    return (
      <div
        className={classNames(
          "text-md mx-1",
          disabled
            ? "text-gray-400 hover:cursor-default"
            : "cursor-pointer hover:text-violet-800",
          invisible ? "invisible" : ""
        )}
        onClick={() => disabled || handlePagination(newer)}
      >
        {newer ? (
          <ChevronLeftIcon className="h-3 w-3" />
        ) : (
          <ChevronRightIcon className="h-3 w-3" />
        )}
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
      <ChatSwitcher />
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
                      {user?.id === s.userId ? (
                        <TrashIcon
                          className="ml-1 hidden h-4 w-4 hover:text-violet-800 group-hover:inline-block"
                          onClick={(e) => handleTrashClick(e, s)}
                        ></TrashIcon>
                      ) : (
                        ""
                      )}
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
