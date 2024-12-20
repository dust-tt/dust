import {
  Avatar,
  BookOpenIcon,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EyeIcon,
  Icon,
  LightbulbIcon,
  LogoutIcon,
  StarIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import { isOnlyAdmin, isOnlyBuilder, isOnlyUser } from "@dust-tt/types";
import { BugIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { forceUserRole, showDebugTools } from "@app/lib/development";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

export function UserMenu({
  user,
  owner,
}: {
  user: UserType;
  owner: WorkspaceType;
}) {
  const router = useRouter();
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
        <div className="flex items-center gap-2">
          <span className="sr-only">Open user menu</span>
          <Avatar
            size="sm"
            visual={
              user.image
                ? user.image
                : "https://gravatar.com/avatar/anonymous?d=mp"
            }
            onClick={() => {
              "clickable";
            }}
          />
          <Icon visual={ChevronDownIcon} />
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        {hasBetaAccess && (
          <>
            <DropdownMenuLabel label="Beta" />
            {featureFlags.includes("labs_transcripts") && (
              <DropdownMenuItem
                label="Meeting transcripts"
                icon={BookOpenIcon}
                onClick={() => {
                  void router.push(
                    `/w/${owner.sId}/assistant/labs/transcripts`
                  );
                }}
              />
            )}
            {featureFlags.includes("labs_trackers") && (
              <DropdownMenuItem
                label="Trackers"
                icon={EyeIcon}
                onClick={() => {
                  void router.push(`/w/${owner.sId}/assistant/labs/trackers`);
                }}
              />
            )}
            <DropdownMenuItem
              label="Extension"
              icon={LightbulbIcon}
              onClick={() => {
                if (typeof window !== "undefined" && window.chrome?.runtime) {
                  chrome.runtime.sendMessage(
                    "okjldflokifdjecnhbmkdanjjbnmlihg",
                    {
                      action: "openSidePanel",
                      workspaceId: owner.sId,
                      conversationId: "M1wNSpqgq9",
                    },
                    (response) => {
                      console.log("Message sent:", response);
                    }
                  );
                }
              }}
            />
          </>
        )}

        {showDebugTools(owner) && (
          <>
            <DropdownMenuLabel label="Dev Tools" />
            {router.route === "/w/[wId]/assistant/[cId]" && (
              <DropdownMenuItem
                label="Debug conversation"
                onClick={() => {
                  const regexp = new RegExp(`/w/([^/]+)/assistant/([^/]+)`);
                  const match = window.location.href.match(regexp);
                  if (match) {
                    void router.push(
                      `/poke/${match[1]}/conversations/${match[2]}`
                    );
                  }
                }}
                icon={BugIcon}
              />
            )}
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
          onClick={() => {
            void router.push("/api/auth/logout");
          }}
          icon={LogoutIcon}
          label="Sign&nbsp;out"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
