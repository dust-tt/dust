import {
  Avatar,
  BookOpenIcon,
  LightbulbIcon,
  LogoutIcon,
  NewDropdownMenu,
  NewDropdownMenuContent,
  NewDropdownMenuItem,
  NewDropdownMenuLabel,
  NewDropdownMenuTrigger,
  StarIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import { isOnlyAdmin, isOnlyBuilder, isOnlyUser } from "@dust-tt/types";
import Link from "next/link";
import { useContext, useMemo } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { canForceUserRole, forceUserRole } from "@app/lib/development";

export function UserMenu({
  user,
  owner,
}: {
  user: UserType;
  owner: WorkspaceType;
}) {
  const hasBetaAccess = owner.flags.some((flag: string) =>
    flag.startsWith("labs_")
  );
  const sendNotification = useContext(SendNotificationsContext);

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
    <NewDropdownMenu>
      <NewDropdownMenuTrigger>
        <>
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
        </>
      </NewDropdownMenuTrigger>

      <NewDropdownMenuContent>
        {hasBetaAccess && (
          <>
            <NewDropdownMenuLabel label="Beta" />
            {owner.flags.includes("labs_transcripts") && (
              <Link href={`/w/${owner.sId}/assistant/labs/transcripts`}>
                <NewDropdownMenuItem
                  label="Transcripts processing"
                  icon={BookOpenIcon}
                />
              </Link>
            )}
          </>
        )}

        {canForceUserRole(owner) && (
          <>
            <NewDropdownMenuLabel label="Dev Tools" />
            {!isOnlyAdmin(owner) && (
              <NewDropdownMenuItem
                label="Become Admin"
                onClick={() => forceRoleUpdate("admin")}
                icon={StarIcon}
              />
            )}
            {!isOnlyBuilder(owner) && (
              <NewDropdownMenuItem
                label="Become Builder"
                onClick={() => forceRoleUpdate("builder")}
                icon={LightbulbIcon}
              />
            )}
            {!isOnlyUser(owner) && (
              <NewDropdownMenuItem
                label="Become User"
                onClick={() => forceRoleUpdate("user")}
                icon={UserIcon}
              />
            )}
          </>
        )}

        <NewDropdownMenuLabel label="Account" />
        <Link href="/api/auth/logout">
          <NewDropdownMenuItem label="Sign&nbsp;out" icon={LogoutIcon} />
        </Link>
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}
