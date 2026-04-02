import { useConversationDrafts } from "@app/components/assistant/conversation/input_bar/useConversationDrafts";
import { WorkspacePickerRadioGroup } from "@app/components/WorkspacePicker";
import { useSendNotification } from "@app/hooks/useNotification";
import { usePrivacyMask } from "@app/hooks/usePrivacyMask";
import config from "@app/lib/api/config";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  forceUserRole,
  isInlineActivityEnabled,
  isSingleAgentInputEnabled,
  sendOnboardingConversation,
  showDebugTools,
  toggleInlineActivity,
  toggleSingleAgentInput,
} from "@app/lib/development";
import { useAppRouter } from "@app/lib/platform";
import type { SubscriptionType } from "@app/types/plan";
import { isDevelopment } from "@app/types/shared/env";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";
import { isOnlyAdmin, isOnlyBuilder, isOnlyUser } from "@app/types/user";
import { datadogLogs } from "@datadog/browser-logs";
import {
  Avatar,
  ChatBubbleBottomCenterPlusIcon,
  ChevronDownIcon,
  ChromeLogo,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  EyeIcon,
  EyeSlashIcon,
  Icon,
  LightbulbIcon,
  LogoutIcon,
  ShapesIcon,
  StarIcon,
  TestTubeIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

interface UserMenuProps {
  user: UserTypeWithWorkspaces;
  owner: WorkspaceType;
  subscription: SubscriptionType | null;
}

export function UserMenu({ user, owner, subscription }: UserMenuProps) {
  const router = useAppRouter();
  const { featureFlags } = useFeatureFlags();

  const sendNotification = useSendNotification();
  const privacyMask = usePrivacyMask();
  const [inlineActivity, setInlineActivity] = useState(isInlineActivityEnabled);
  const handleToggleInlineActivity = useCallback(() => {
    const next = toggleInlineActivity();
    setInlineActivity(next);
    sendNotification({
      title: `Inline activity ${next ? "enabled" : "disabled"}`,
      description: "Reload the page to apply.",
      type: "success",
    });
  }, [sendNotification]);
  const [singleAgentInput, setSingleAgentInput] = useState(() =>
    isSingleAgentInputEnabled()
  );
  const handleToggleSingleAgentInput = () => {
    const next = toggleSingleAgentInput();
    setSingleAgentInput(next);
    sendNotification({
      title: `Single agent input ${next ? "enabled" : "disabled"}`,
      description: "Reload the page to apply.",
      type: "success",
    });
  };

  const { clearAllDraftsFromUser } = useConversationDrafts({
    workspaceId: owner.sId,
    userId: user.sId,
    draftKey: "user-menu",
  });

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

  const handleSendOnboarding = useMemo(
    () => async () => {
      const result = await sendOnboardingConversation(owner, featureFlags);
      if (result.isOk) {
        sendNotification({
          title: "Success !",
          description: "Onboarding conversation created (redirecting...)",
          type: "success",
        });
        setTimeout(() => {
          void router.push(
            `/w/${owner.sId}/conversation/${result.conversationSId}`
          );
        }, 1000);
      } else {
        sendNotification({
          title: "Error !",
          description: result.error,
          type: "error",
        });
      }
    },
    [owner, sendNotification, featureFlags, router]
  );

  // Check if user has multiple workspaces (from WorkOS orgs, or in dev
  // mode from local DB workspaces as fallback).
  const hasMultipleWorkspaces = useMemo(() => {
    const hasMultipleOrgs =
      !!user.organizations && user.organizations.length > 1;
    const hasMultipleLocalWorkspaces =
      isDevelopment() &&
      !user.organizations?.length &&
      user.workspaces.length > 1;
    return hasMultipleOrgs || hasMultipleLocalWorkspaces;
  }, [user]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className="group flex max-w-[200px] cursor-pointer items-center gap-2">
          <span className="sr-only">Open user menu</span>
          <Avatar
            size="sm"
            visual={
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              user.image
                ? user.image
                : "https://gravatar.com/avatar/anonymous?d=mp"
            }
            clickable
            isRounded
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
            <span className="-mt-0.5 w-full truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
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
            <WorkspacePickerRadioGroup user={user} workspace={owner} />
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
            label="Personal Settings"
            icon={UserIcon}
            href={`/w/${owner.sId}/me`}
          />
        )}

        <DropdownMenuItem
          label="Sign&nbsp;out"
          icon={LogoutIcon}
          onClick={() => {
            // Clear all conversation drafts for this user.
            clearAllDraftsFromUser();

            datadogLogs.clearUser();
            window.DD_RUM?.onReady(() => {
              window.DD_RUM?.clearUser();
            });
            window.location.href = `${config.getApiBaseUrl()}/api/workos/logout`;
          }}
        />

        {showDebugTools(featureFlags) && (
          <>
            <DropdownMenuLabel label="Advanced" />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger label="Dev Tools" icon={ShapesIcon} />
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {(router.pathname === "/w/[wId]/conversation/[cId]" ||
                    router.pathname.match(
                      /^\/w\/[^/]+\/conversation\/[^/]+$/
                    )) && (
                    <DropdownMenuItem
                      label="Debug conversation"
                      onClick={() => {
                        const regexp = new RegExp(
                          `/w/([^/]+)/conversation/([^/]+)`
                        );
                        const match = window.location.href.match(regexp);
                        if (match) {
                          window.open(
                            `/poke/${match[1]}/conversation/${match[2]}`,
                            "_blank"
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
                  <DropdownMenuItem
                    label={`${privacyMask.isEnabled ? "Disable" : "Enable"} Privacy Mask`}
                    onClick={privacyMask.toggle}
                    icon={privacyMask.isEnabled ? EyeSlashIcon : EyeIcon}
                  />
                  <DropdownMenuItem
                    label={`${inlineActivity ? "Disable" : "Enable"} Inline Activity`}
                    onClick={handleToggleInlineActivity}
                    icon={TestTubeIcon}
                  />
                  <DropdownMenuItem
                    label={`${singleAgentInput ? "Disable" : "Enable"} Single Agent Input`}
                    onClick={handleToggleSingleAgentInput}
                    icon={TestTubeIcon}
                  />
                  {owner.role === "admin" && (
                    <DropdownMenuItem
                      label="Send onboarding conversation"
                      onClick={handleSendOnboarding}
                      icon={ChatBubbleBottomCenterPlusIcon}
                    />
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
