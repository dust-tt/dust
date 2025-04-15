import {
  Avatar,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Icon,
  LightbulbIcon,
  LightModeIcon,
  LogoutIcon,
  StarIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import { BugIcon, TestTubeIcon, UserCogIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { forceUserRole, showDebugTools } from "@app/lib/development";
import { usePersistedNavigationSelection } from "@app/hooks/usePersistedNavigationSelection";
import { useDeleteMetadata } from "@app/lib/swr/user";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  UserType,
  WorkspaceType,
  UserTypeWithWorkspaces,
} from "@app/types";
import { isOnlyAdmin, isOnlyBuilder, isOnlyUser } from "@app/types";

export function UserMenu({
  user,
  owner,
}: {
  user: UserType | UserTypeWithWorkspaces;
  owner: WorkspaceType;
}) {
  const router = useRouter();
  const { featureFlags, hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const { deleteMetadata: deleteServerValidationMetadata } =
    useDeleteMetadata("toolsValidations");

  const sendNotification = useSendNotification();
  const { setNavigationSelection } = usePersistedNavigationSelection();

  const forceRoleUpdate = useMemo(
    () => async (role: "user" | "builder" | "admin") => {
      const result = await forceUserRole(user, owner, role, featureFlags);
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
    [owner, sendNotification, user, featureFlags]
  );

  const theme = localStorage.getItem("theme") || "light";

  // Check if user has multiple workspaces
  const hasMultipleWorkspaces = useMemo(() => {
    return (
      "workspaces" in user && user.workspaces && user.workspaces.length > 1
    );
  }, [user]);

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
          <div className="flex flex-col items-start pr-4">
            <span className="text-sm font-medium">{user.firstName}</span>
            <span className="text-sm text-muted-foreground">{owner.name}</span>
          </div>
          <Icon visual={ChevronDownIcon} />
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuLabel label="Beta" />
        <DropdownMenuItem
          label="Exploratory features"
          icon={TestTubeIcon}
          href={`/w/${owner.sId}/labs`}
        />

        {showDebugTools(featureFlags) && (
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

        <DropdownMenuLabel label="Preferences" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Theme" icon={LightModeIcon} />

          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme}>
              <DropdownMenuRadioItem
                value="light"
                label="Light"
                onClick={() => {
                  localStorage.setItem("theme", "light");
                  window.location.reload();
                }}
              />
              <DropdownMenuRadioItem
                value="dark"
                label="Dark"
                onClick={() => {
                  localStorage.setItem("theme", "dark");
                  window.location.reload();
                }}
              />
              <DropdownMenuRadioItem
                value="system"
                label="System"
                onClick={() => {
                  localStorage.setItem("theme", "system");
                  window.location.reload();
                }}
              />
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuLabel label="Account" />
        <DropdownMenuItem
          label="Profile"
          icon={UserIcon}
          href={`/w/${owner.sId}/me`}
        />

        <DropdownMenuItem
          onClick={() => {
            void router.push("/api/auth/logout");
          }}
          icon={LogoutIcon}
          label="Sign&nbsp;out"
        />

        <DropdownMenuLabel label="Workspaces" />
        {hasMultipleWorkspaces && (
          <DropdownMenuRadioGroup value={owner.name}>
            {"workspaces" in user &&
              user.workspaces.map((w) => (
                <DropdownMenuRadioItem
                  key={w.sId}
                  value={w.name}
                  onClick={async () => {
                    await setNavigationSelection({
                      lastWorkspaceId: w.sId,
                    });
                    if (w.id !== owner.id) {
                      await router
                        .push(`/w/${w.sId}/assistant/new`)
                        .then(() => router.reload());
                    }
                  }}
                >
                  {w.name}
                </DropdownMenuRadioItem>
              ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
