import {
  Avatar,
  BookOpenIcon,
  DropdownMenu,
  LogoutIcon,
  RobotIcon,
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
  const hasBetaAccess =
    owner.flags?.some((flag: string) => flag.startsWith("labs_")) ||
    isDevelopmentOrDustWorkspace(owner);

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
        {hasBetaAccess && (
          <>
            <DropdownMenu.SectionHeader label="Beta" />
            {(owner.flags.includes("labs_transcripts") ||
              isDevelopmentOrDustWorkspace(owner)) && (
              <DropdownMenu.Item
                label="Transcripts processing"
                href={`/w/${owner.sId}/assistant/labs/transcripts`}
                icon={BookOpenIcon}
              />
            )}
            {(owner.flags.includes("labs_extract") ||
              isDevelopmentOrDustWorkspace(owner)) && (
              <DropdownMenu.Item
                label="Extract"
                href={`/w/${owner.sId}/builder/labs/extract`}
                icon={RobotIcon}
              />
            )}
          </>
        )}
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
