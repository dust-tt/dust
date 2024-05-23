import {
  Avatar,
  BookOpenIcon,
  DropdownMenu,
  LogoutIcon,
} from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";

import { isDevelopmentOrDustWorkspace } from "@app/lib/development";

export function UserMenu({
  user,
  owner,
}: {
  user: UserType;
  owner: WorkspaceType;
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Button className="flex rounded-full bg-gray-800 text-sm focus:outline-none">
        <span className="sr-only">Open user menu</span>
        <Avatar
          size="md"
          visual={
            user.image
              ? user.image
              : "https://gravatar.com/avatar/anonymous?d=mp"
          }
          onClick={() => {
            "clickable";
          }}
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items origin="topRight" width={220}>
        <DropdownMenu.SectionHeader label="Account" />
        <DropdownMenu.Item
          label="Sign&nbsp;out"
          href="/api/auth/logout"
          icon={LogoutIcon}
        />
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
