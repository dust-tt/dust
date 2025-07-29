import { datadogLogs } from "@datadog/browser-logs";
import {
  Avatar,
  ChevronDownIcon,
  ChromeLogo,
  cn,
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
  LogoutIcon,
  ShapesIcon,
  StarIcon,
  TestTubeIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { usePersistedNavigationSelection } from "@app/hooks/usePersistedNavigationSelection";
import { forceUserRole, showDebugTools } from "@app/lib/development";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  SubscriptionType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@app/types";
import { isOnlyAdmin, isOnlyBuilder, isOnlyUser } from "@app/types";

export function UserMenu({
  user,
  owner,
  subscription,
}: {
  user: UserTypeWithWorkspaces;
  owner: WorkspaceType;
  subscription: SubscriptionType | null;
}) {
  const router = useRouter();
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

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

  // Check if user has multiple workspaces
  const hasMultipleWorkspaces = useMemo(() => {
    return (
      "workspaces" in user && user.workspaces && user.workspaces.length > 1
    );
  }, [user]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className="group flex max-w-[200px] cursor-pointer items-center gap-2">
          <span className="sr-only">Open user menu</span>
          <Avatar
            size="sm"
            visual={
              user.image
                ? user.image
                : "https://gravatar.com/avatar/anonymous?d=mp"
            }
            clickable
          />
          <div className="flex min-w-0 flex-1 flex-col items-start text-left">
            <span
              className={cn(
                "heading-sm w-full truncate transition-colors duration-200",
                "text-foreground group-hover:text-primary-600 group-active:text-primary-950 dark:text-foreground-night dark:group-hover:text-muted-foreground-night dark:group-active:text-primary-700"
              )}
            >
              {user.firstName}
            </span>
            <span className="w-full truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
              {owner.name}
            </span>
          </div>
          <div className="flex-shrink-0">
            <Icon
              visual={ChevronDownIcon}
              className="text-muted-foreground group-hover:text-primary-400 group-active:text-primary-950 dark:text-muted-foreground-night dark:group-hover:text-foreground-night dark:group-active:text-primary-700"
            />
          </div>
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        {hasMultipleWorkspaces && (
          <>
            <DropdownMenuLabel label="Workspace" />
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
          </>
        )}

        {subscription?.plan.limits.canUseProduct && (
          <>
            <DropdownMenuLabel label="Beta" />
            <DropdownMenuItem
              label="Exploratory features"
              icon={TestTubeIcon}
              href={`/w/${owner.sId}/labs`}
            />
          </>
        )}

        <DropdownMenuLabel label="Extension" />
        <DropdownMenuItem
          label="Dust Chrome Extension"
          icon={ChromeLogo}
          href="https://chromewebstore.google.com/detail/dust/fnkfcndbgingjcbdhaofkcnhcjpljhdn?authuser=0&hl=fr"
          target="_blank"
        />

        <DropdownMenuLabel label="Account" />
        {subscription?.plan.limits.canUseProduct && (
          <DropdownMenuItem
            label="Profile"
            icon={UserIcon}
            href={`/w/${owner.sId}/me`}
          />
        )}

        <DropdownMenuItem
          label="Sign&nbsp;out"
          icon={LogoutIcon}
          onClick={() => {
            datadogLogs.clearUser();
            window.location.href = "/api/workos/logout";
          }}
        />

        {showDebugTools(featureFlags) && (
          <>
            <DropdownMenuLabel label="Advanced" />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger label="Dev Tools" icon={ShapesIcon} />
              <DropdownMenuSubContent>
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
                    icon={ShapesIcon}
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
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
