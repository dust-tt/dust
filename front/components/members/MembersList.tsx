import { Avatar, ChevronRightIcon, Chip, Icon } from "@dust-tt/sparkle";
import type { UserTypeWithWorkspaces } from "@dust-tt/types";
import assert from "assert";

import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { classNames } from "@app/lib/utils";

export function MembersList({
  users,
  currentUserId,
  isMembersLoading,
  onClickEvent,
  searchText,
}: {
  users: UserTypeWithWorkspaces[];
  currentUserId: number;
  isMembersLoading: boolean;
  onClickEvent: (role: UserTypeWithWorkspaces) => void;
  searchText?: string;
}) {
  const filteredUsers = users
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .filter((m) => m.workspaces[0].role !== "none")
    .filter(
      (m) =>
        !searchText ||
        m.fullName.toLowerCase().includes(searchText.toLowerCase()) ||
        m.email?.toLowerCase().includes(searchText.toLowerCase()) ||
        m.username?.toLowerCase().includes(searchText.toLowerCase())
    );
  return (
    <div className="s-w-full">
      {filteredUsers.map((user) => {
        const role = user.workspaces[0].role;
        assert(
          role !== "none",
          "Unreachable (typescript pleasing): role cannot be none"
        );
        return (
          <div
            key={`member-${user.id}`}
            className="transition-color flex cursor-pointer items-center justify-center gap-3 border-t border-structure-200 p-2 text-xs duration-200 hover:bg-action-50 sm:text-sm"
            onClick={async () => {
              if (currentUserId === user.id) {
                return;
              }
              onClickEvent(user);
            }}
          >
            <div className="hidden sm:block">
              <Avatar visual={user.image} name={user.fullName} size="sm" />
            </div>
            <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
              <div className="font-medium text-element-900">
                {user.fullName}
                {user.id === currentUserId && " (you)"}
              </div>
              <div className="grow font-normal text-element-700">
                {user.email || user.username}
              </div>
            </div>
            <div>
              <Chip
                size="xs"
                color={ROLES_DATA[role]["color"]}
                className="capitalize"
              >
                {displayRole(role)}
              </Chip>
            </div>
            <div className="hidden sm:block">
              <Icon
                visual={ChevronRightIcon}
                className={classNames(
                  "text-element-600",
                  user.id === currentUserId ? "invisible" : ""
                )}
              />
            </div>
          </div>
        );
      })}
      {isMembersLoading && (
        <div className="flex animate-pulse cursor-pointer items-center justify-center gap-3 border-t border-structure-200 bg-structure-50 py-2 text-xs sm:text-sm">
          <div className="hidden sm:block">
            <Avatar size="xs" />
          </div>
          <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
            <div className="font-medium text-element-900">Loading...</div>
            <div className="grow font-normal text-element-700"></div>
          </div>
          <div>
            <Chip size="xs" color="slate">
              Loading...
            </Chip>
          </div>
          <div className="hidden sm:block">
            <ChevronRightIcon />
          </div>
        </div>
      )}
    </div>
  );
}
