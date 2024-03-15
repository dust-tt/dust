import { Avatar, DropdownMenu } from "@dust-tt/sparkle";
import type { UserType } from "@dust-tt/types";

export function UserMenu({ user }: { user: UserType }) {
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
      <DropdownMenu.Items origin="topRight">
        <DropdownMenu.Item label="Sign&nbsp;out" href="/api/auth/logout" />
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
