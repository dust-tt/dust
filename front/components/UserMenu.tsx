import {
  Avatar,
  BookOpenIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
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
      <DropdownMenuTrigger>
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
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        {hasBetaAccess && (
          <>
            <DropdownMenuLabel label="Beta" />
            {featureFlags.includes("labs_transcripts") && (
              <DropdownMenuItem
                label="Meeting transcripts"
                icon={BookOpenIcon}
                href={`/w/${owner.sId}/assistant/labs/transcripts`}
              />
            )}
          </>
        )}

        {canForceUserRole(owner) && (
          <>
            <DropdownMenuLabel label="Dev Tools" />
            {!isOnlyAdmin(owner) && (
              <DropdownMenuItem
                label="Become Admin"
                onClick={() => forceRoleUpdate("admin")}
                icon={StarIcon}
              />
            )}
            {!isOnlyBuilder(owner) && (
              <DropdownMenuItem
                label="Become Builder"
                onClick={() => forceRoleUpdate("builder")}
                icon={LightbulbIcon}
              />
            )}
            {!isOnlyUser(owner) && (
              <DropdownMenuItem
                label="Become User"
                onClick={() => forceRoleUpdate("user")}
                icon={UserIcon}
              />
            )}
          </>
        )}

        <DropdownMenuLabel label="Account" />
        <DropdownMenuItem
          href="/api/auth/logout"
          icon={LogoutIcon}
          label="Sign&nbsp;out"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
