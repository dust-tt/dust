import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useConversationDrafts } from "@app/components/assistant/conversation/input_bar/useConversationDrafts";
import { UserSettingsPopover } from "@app/components/UserSettingsPopover";
import { WorkspacePickerRadioGroup } from "@app/components/WorkspacePicker";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useDevMode } from "@app/hooks/useDevMode";
import { useSendNotification } from "@app/hooks/useNotification";
import { usePrivacyMask } from "@app/hooks/usePrivacyMask";
import config from "@app/lib/api/config";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import {
  forceUserRole,
  sendOnboardingConversation,
  showDebugTools,
} from "@app/lib/development";
import { serializeMention } from "@app/lib/mentions/format";
import { ConversationsUpdatedEvent } from "@app/lib/notifications/events";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { AgentMention, MentionType } from "@app/types/assistant/mentions";
import { isAgentMention } from "@app/types/assistant/mentions";
import type { SubscriptionType } from "@app/types/plan";
import { isDevelopment } from "@app/types/shared/env";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";
import { isOnlyAdmin, isOnlyBuilder, isOnlyUser } from "@app/types/user";
import { datadogLogs } from "@datadog/browser-logs";
import {
  Avatar,
  Beaker02,
  BookOpen01,
  ChevronDown,
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
  Eye,
  EyeOff,
  FirefoxLogo,
  Heart,
  Icon,
  Lightbulb04,
  LogOut01,
  MessageChatCircle,
  MessagePlusCircle,
  MessageTextCircle01,
  Separator,
  Shapes,
  SlackLogo,
  Star01,
  Terminal,
  User01,
} from "@dust-tt/sparkle";
import { useCallback, useContext, useMemo, useState } from "react";

interface UserMenuProps {
  user: UserTypeWithWorkspaces;
  owner: WorkspaceType;
  subscription: SubscriptionType | null;
}

export function UserMenu({ user, owner, subscription }: UserMenuProps) {
  const router = useAppRouter();
  const { featureFlags, hasFeature } = useFeatureFlags();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const sendNotification = useSendNotification();
  const devMode = useDevMode();
  const privacyMask = usePrivacyMask();
  const { clearAllDraftsFromUser } = useConversationDrafts({
    workspaceId: owner.sId,
    userId: user.sId,
    draftKey: "user-menu",
  });

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const { setSelectedAgent } = useContext(InputBarContext);

  const handleAskHelp = () => {
    if (
      router.pathname === "/w/[wId]/conversation/[cId]" ||
      router.pathname.match(/^\/w\/[^/]+\/conversation\/[^/]+$/)
    ) {
      setSelectedAgent({
        type: "agent",
        id: GLOBAL_AGENTS_SID.HELPER,
        label: "Help",
        pictureUrl:
          "https://dust.tt/static/systemavatar/helper_avatar_full.png",
        description: "Help on how to use Dust",
      });
    } else {
      void router.push(
        getConversationRoute(
          owner.sId,
          "new",
          `agent=${GLOBAL_AGENTS_SID.HELPER}`
        )
      );
    }
  };

  const { submit: handleHelpSubmit } = useSubmitFunction(
    useCallback(
      async (input: string, mentions: MentionType[]) => {
        const inputWithHelp = input.includes("@help")
          ? input
          : `@help ${input.trimStart()}`;
        const mentionsWithHelp = mentions.some(
          (mention) =>
            isAgentMention(mention) &&
            mention.configurationId === GLOBAL_AGENTS_SID.HELPER
        )
          ? mentions
          : [
              ...mentions,
              { configurationId: GLOBAL_AGENTS_SID.HELPER } as AgentMention,
            ];
        const conversationRes = await createConversationWithMessage({
          messageData: {
            input: inputWithHelp.replace(
              "@help",
              serializeMention({ name: "help", sId: GLOBAL_AGENTS_SID.HELPER })
            ),
            mentions: mentionsWithHelp,
            contentFragments: {
              uploaded: [],
              contentNodes: [],
            },
          },
        });
        if (conversationRes.isErr()) {
          sendNotification({
            title: conversationRes.error.title,
            description: conversationRes.error.message,
            type: "error",
          });
        } else {
          void router.push(
            getConversationRoute(owner.sId, conversationRes.value.sId)
          );
        }
      },
      [createConversationWithMessage, owner, router, sendNotification]
    )
  );

  const isFirefox =
    typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);

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
        window.dispatchEvent(new ConversationsUpdatedEvent());
        sendNotification({
          title: "Success !",
          description: "Onboarding conversation created (redirecting...)",
          type: "success",
        });
        setTimeout(() => {
          void router.push(
            `/w/${owner.sId}/conversation/${result.conversationId}`
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
    <>
      {hasFeature("user_settings_v2") && (
        <UserSettingsPopover
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          owner={owner}
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-sidebar-hover data-[state=open]:bg-sidebar-hover dark:hover:bg-sidebar-hover-night dark:data-[state=open]:bg-sidebar-hover-night rounded-xl p-2 m-2">
          <div className="group flex cursor-pointer items-center justify-between gap-2">
            <span className="sr-only">Open user menu</span>
            <div className="flex gap-2 items-center">
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
                    "heading-sm w-full truncate transition-colors",
                    "text-foreground dark:text-foreground-night"
                  )}
                >
                  {user.firstName}
                </span>
                <span className="-mt-0.5 w-full truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {owner.name}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0">
              <Icon
                visual={ChevronDown}
                className="text-muted-foreground group-hover:text-primary-400 group-active:text-primary-950 dark:text-muted-foreground-night dark:group-hover:text-foreground-night dark:group-active:text-primary-700"
              />
            </div>
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={8}
          className="w-64"
        >
          {hasMultipleWorkspaces && (
            <>
              <DropdownMenuLabel label="Workspace" />
              <WorkspacePickerRadioGroup user={user} workspace={owner} />
              <Separator className="my-1" />
            </>
          )}

          <DropdownMenuSub>
            <DropdownMenuSubTrigger label="Help" icon={Heart} />
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuLabel label="Learn about Dust" />
                <DropdownMenuItem
                  label="Quickstart Guide"
                  icon={Lightbulb04}
                  onClick={() =>
                    router.push(
                      {
                        pathname: router.pathname,
                        query: { ...router.query, quickGuide: "true" },
                      },
                      undefined,
                      { shallow: true }
                    )
                  }
                />
                <DropdownMenuItem
                  label="Guides & Documentation"
                  icon={BookOpen01}
                  href="https://docs.dust.tt"
                  target="_blank"
                />
                <DropdownMenuItem
                  label="Join the Slack Community"
                  icon={SlackLogo}
                  href="https://dust-community.tightknit.community/join"
                  target="_blank"
                />
                <DropdownMenuLabel label="Ask questions" />
                <DropdownMenuItem
                  label="Ask @help"
                  icon={MessageChatCircle}
                  onClick={() => void handleAskHelp()}
                />
                <DropdownMenuItem
                  label="How do I invite new users?"
                  icon={MessageTextCircle01}
                  onClick={() =>
                    void handleHelpSubmit("How do I invite new users?", [])
                  }
                />
                <DropdownMenuItem
                  label="How to use agents in Slack workflow?"
                  icon={MessageTextCircle01}
                  onClick={() =>
                    void handleHelpSubmit(
                      "How to use agents in Slack workflow?",
                      []
                    )
                  }
                />
                <DropdownMenuItem
                  label="How to manage billing?"
                  icon={MessageTextCircle01}
                  onClick={() =>
                    void handleHelpSubmit("How to manage billing?", [])
                  }
                />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem
            label="Dust Academy"
            icon={BookOpen01}
            href="https://dust.tt/academy"
            target="_blank"
          />

          {isFirefox ? (
            <DropdownMenuItem
              label="Firefox extension"
              icon={FirefoxLogo}
              href="https://addons.mozilla.org/firefox/addon/dust/"
              target="_blank"
            />
          ) : (
            <DropdownMenuItem
              label="Chrome extension"
              icon={ChromeLogo}
              href="https://chromewebstore.google.com/detail/dust/fnkfcndbgingjcbdhaofkcnhcjpljhdn"
              target="_blank"
            />
          )}

          {subscription?.plan.limits.canUseProduct && (
            <>
              <DropdownMenuItem
                label="Exploratory features"
                icon={Beaker02}
                href={`/w/${owner.sId}/labs`}
              />
              <Separator className="my-1" />
            </>
          )}

          <DropdownMenuLabel label="Account" />
          {subscription?.plan.limits.canUseProduct && (
            <>
              <DropdownMenuItem
                label="Personal Settings"
                icon={User01}
                href={`/w/${owner.sId}/me`}
              />
              {hasFeature("user_settings_v2") && (
                <DropdownMenuItem
                  label="Personal Settings — Beta"
                  icon={User01}
                  onSelect={() => setSettingsOpen(true)}
                />
              )}
            </>
          )}

          <DropdownMenuItem
            label="Sign&nbsp;out"
            icon={LogOut01}
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
              <Separator className="my-1" />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger label="Dev Tools" icon={Shapes} />
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
                        icon={Shapes}
                      />
                    )}
                    {!isOnlyAdmin(owner) && (
                      <DropdownMenuItem
                        label="Become Admin"
                        onClick={() => forceRoleUpdate("admin")}
                        icon={Star01}
                      />
                    )}
                    {!isOnlyBuilder(owner) && (
                      <DropdownMenuItem
                        label="Become Builder"
                        onClick={() => forceRoleUpdate("builder")}
                        icon={Lightbulb04}
                      />
                    )}
                    {!isOnlyUser(owner) && (
                      <DropdownMenuItem
                        label="Become User"
                        onClick={() => forceRoleUpdate("user")}
                        icon={User01}
                      />
                    )}
                    <DropdownMenuItem
                      label={`${privacyMask.isEnabled ? "Disable" : "Enable"} Privacy Mask`}
                      onClick={privacyMask.toggle}
                      icon={privacyMask.isEnabled ? EyeOff : Eye}
                    />
                    <DropdownMenuItem
                      label={`${devMode.isEnabled ? "Disable" : "Enable"} Dev Console`}
                      onClick={devMode.toggle}
                      icon={Terminal}
                    />
                    {owner.role === "admin" && (
                      <DropdownMenuItem
                        label="Send onboarding conversation"
                        onClick={handleSendOnboarding}
                        icon={MessagePlusCircle}
                      />
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
