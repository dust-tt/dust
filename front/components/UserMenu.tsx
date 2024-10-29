import {
  Avatar,
  BookOpenIcon,
  DropdownMenu,
  LightbulbIcon,
  LogoutIcon,
  StarIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import { isOnlyAdmin, isOnlyBuilder, isOnlyUser } from "@dust-tt/types";
import { useMemo } from "react";

import { canForceUserRole, forceUserRole } from "@app/lib/development";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

export function UserMenu({
  user,
  owner,
}: {
  user: UserType;
  owner: WorkspaceType;
}) {
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

  const hasBetaAccess = featureFlags.some((flag: string) =>
    flag.startsWith("labs_")
  );
  const sendNotification = useSendNotification();

  const forceRoleUpdate = useMemo(
    () => async (role: "user" | "builder" | "admin") => {
      const result = await forceUserRole(user, owner, role);
      if (result.isOk()) {
        sendNotification({
          title: "Success !",
          description: result.value + " (reloading...)",
          type: "success",
        });
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        sendNotification({
          title: "Error !",
          description: result.error,
          type: "error",
        });
      }
    },
    [owner, sendNotification, user]
  );

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
            {featureFlags.includes("labs_transcripts") && (
              <DropdownMenu.Item
                label="Meeting transcripts"
                link={{ href: `/w/${owner.sId}/assistant/labs/transcripts` }}
                icon={BookOpenIcon}
              />
            )}
          </>
        )}
        {canForceUserRole(owner) && (
          <>
            <DropdownMenu.SectionHeader label="Dev Tools" />
            {!isOnlyAdmin(owner) && (
              <DropdownMenu.Item
                label="Become Admin"
                onClick={() => forceRoleUpdate("admin")}
                icon={StarIcon}
              />
            )}
            {!isOnlyBuilder(owner) && (
              <DropdownMenu.Item
                label="Become Builder"
                onClick={() => forceRoleUpdate("builder")}
                icon={LightbulbIcon}
              />
            )}
            {!isOnlyUser(owner) && (
              <DropdownMenu.Item
                label="Become User"
                onClick={() => forceRoleUpdate("user")}
                icon={UserIcon}
              />
            )}
          </>
        )}
        <DropdownMenu.SectionHeader label="Account" />
        <DropdownMenu.Item
          label="Sign&nbsp;out"
          link={{ href: "/api/auth/logout" }}
          icon={LogoutIcon}
        />
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
