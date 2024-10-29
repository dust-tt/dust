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
            {featureFlags.includes("labs_transcripts") && (
              <NewDropdownMenuItem
                label="Meeting transcripts"
                icon={BookOpenIcon}
                href={`/w/${owner.sId}/assistant/labs/transcripts`}
              />
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
        <NewDropdownMenuItem
          href="/api/auth/logout"
          icon={LogoutIcon}
          label="Sign&nbsp;out"
        />
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}
