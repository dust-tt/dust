import type { CreditUsageState } from "@app/components/app/CreditUsage";
import { CreditUsage } from "@app/components/app/CreditUsage";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useConversationDrafts } from "@app/components/assistant/conversation/input_bar/useConversationDrafts";
import { UserToolsDialog } from "@app/components/me/UserToolsDialog";
import { UserSettingsPopover } from "@app/components/UserSettingsPopover";
import { WorkspacePickerRadioGroup } from "@app/components/WorkspacePicker";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useDevMode } from "@app/hooks/useDevMode";
import { useSendNotification } from "@app/hooks/useNotification";
import { usePrivacyMask } from "@app/hooks/usePrivacyMask";
import { OPEN_USER_ANALYTICS_EVENT } from "@app/lib/analytics/events";
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
import { useUserMetadata } from "@app/lib/swr/user";
import type { TrackingAction } from "@app/lib/tracking";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import {
  isUserMenuModal,
  USER_MENU_MODAL_QUERY_PARAM,
} from "@app/lib/user_menu";
import { getConversationRoute } from "@app/lib/utils/router";
import { removeParamFromRouter } from "@app/lib/utils/router_util";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { AgentMention, MentionType } from "@app/types/assistant/mentions";
import { isAgentMention } from "@app/types/assistant/mentions";
import {
  EXTENSION_LAST_USED_AT_METADATA_KEY,
  shouldShowExtensionMenu,
} from "@app/types/extension";
import type { SubscriptionType } from "@app/types/plan";
import { isDevelopment } from "@app/types/shared/env";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";
import { isOnlyAdmin, isOnlyManager, isOnlyUser } from "@app/types/user";
import { datadogLogs } from "@datadog/browser-logs";
import {
  Avatar,
  BarChart01,
  Beaker02,
  BookOpen01,
  ChevronDown,
  ChromeLogo,
  Clock,
  cn,
  Dialog,
  DialogContent,
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
  LogOut01,
  MessageChatCircle,
  MessagePlusCircle,
  MessageTextCircle01,
  Separator,
  Shapes,
  ShapesPlus,
  SlackLogo,
  Star01,
  Terminal,
  User01,
} from "@dust-tt/sparkle";
import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const UserAnalyticsPopover = lazy(() =>
  import("@app/components/UserAnalyticsPopover").then((m) => ({
    default: m.UserAnalyticsPopover,
  }))
);
const UserAutomationsDialog = lazy(() =>
  import("@app/components/me/UserAutomationsDialog").then((m) => ({
    default: m.UserAutomationsDialog,
  }))
);

interface UserMenuProps {
  user: UserTypeWithWorkspaces;
  owner: WorkspaceType;
  subscription: SubscriptionType | null;
  creditUsageState?: CreditUsageState | null;
}

function trackUserMenuEvent(
  item: string,
  action: TrackingAction = TRACKING_ACTIONS.CLICK
) {
  trackEvent({
    area: TRACKING_AREAS.NAVIGATION,
    object: "user_menu_item",
    action,
    extra: { item },
  });
}

export function UserMenu({
  user,
  owner,
  subscription,
  creditUsageState,
}: UserMenuProps) {
  const router = useAppRouter();
  const { featureFlags } = useFeatureFlags();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuModal = router.query[USER_MENU_MODAL_QUERY_PARAM];

  const isFirefox =
    typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
  const {
    metadata: extensionLastUsedAt,
    isMetadataLoading: isExtensionLastUsedAtLoading,
  } = useUserMetadata(EXTENSION_LAST_USED_AT_METADATA_KEY);
  const showExtensionMenu =
    !isExtensionLastUsedAtLoading &&
    shouldShowExtensionMenu(extensionLastUsedAt?.value);

  useEffect(() => {
    const openAnalytics = () => setAnalyticsOpen(true);
    window.addEventListener(OPEN_USER_ANALYTICS_EVENT, openAnalytics);
    return () =>
      window.removeEventListener(OPEN_USER_ANALYTICS_EVENT, openAnalytics);
  }, []);

  useEffect(() => {
    if (!router.isReady || !isUserMenuModal(userMenuModal)) {
      return;
    }

    switch (userMenuModal) {
      case "personal-usage":
        setAnalyticsOpen(true);
        break;
      case "personal-automations":
        setAutomationsOpen(true);
        break;
      default:
        assertNeverAndIgnore(userMenuModal);
    }

    void removeParamFromRouter(router, USER_MENU_MODAL_QUERY_PARAM);
  }, [router, userMenuModal]);

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

  const forceRoleUpdate = useMemo(
    () => async (role: "user" | "admin" | "manager") => {
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
      <UserSettingsPopover
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        owner={owner}
      />
      <UserToolsDialog
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        owner={owner}
      />
      <Suspense fallback={null}>
        <UserAutomationsDialog
          open={automationsOpen}
          onOpenChange={setAutomationsOpen}
          owner={owner}
        />
      </Suspense>
      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent size="2xl" height="xl" grow>
          <Suspense fallback={null}>
            <UserAnalyticsPopover
              key={owner.sId}
              open={analyticsOpen}
              owner={owner}
              onClose={() => setAnalyticsOpen(false)}
            />
          </Suspense>
        </DialogContent>
      </Dialog>
      <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
        <DropdownMenuTrigger className="hover:bg-hover data-[state=open]:bg-selected rounded-xl p-2 m-2">
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
                    "text-foreground"
                  )}
                >
                  {user.firstName}
                </span>
                <span className="-mt-0.5 w-full truncate text-sm text-muted-foreground">
                  {owner.name}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0">
              <Icon
                visual={ChevronDown}
                className="text-muted-foreground group-hover:text-primary-400 group-active:text-primary-950"
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
          {subscription?.plan.limits.canUseProduct && creditUsageState && (
            <>
              <CreditUsage
                state={creditUsageState}
                variant="profile_menu"
                onLearnMore={() => {
                  trackUserMenuEvent("credit_usage_learn_more");
                  setUserMenuOpen(false);
                  setAnalyticsOpen(true);
                }}
              />
              <Separator className="my-1" />
            </>
          )}

          {hasMultipleWorkspaces && (
            <>
              <DropdownMenuLabel label="Workspace" />
              <WorkspacePickerRadioGroup user={user} workspace={owner} />
              <Separator className="my-1" />
            </>
          )}

          <DropdownMenuSub
            onOpenChange={(open) => {
              if (open) {
                trackUserMenuEvent("help", TRACKING_ACTIONS.OPEN);
              }
            }}
          >
            <DropdownMenuSubTrigger label="Help" icon={Heart} />
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuLabel label="Learn about Dust" />
                <DropdownMenuItem
                  label="Guides & Documentation"
                  icon={BookOpen01}
                  href="https://docs.dust.tt"
                  target="_blank"
                  onClick={() =>
                    trackUserMenuEvent("help_guides_documentation")
                  }
                />
                <DropdownMenuItem
                  label="Join the Slack Community"
                  icon={SlackLogo}
                  href="https://dust-community.tightknit.community/join"
                  target="_blank"
                  onClick={() => trackUserMenuEvent("help_slack_community")}
                />
                <DropdownMenuLabel label="Ask questions" />
                <DropdownMenuItem
                  label="Ask @help"
                  icon={MessageChatCircle}
                  onClick={() => {
                    trackUserMenuEvent("help_ask");
                    handleAskHelp();
                  }}
                />
                <DropdownMenuItem
                  label="How do I invite new users?"
                  icon={MessageTextCircle01}
                  onClick={() => {
                    trackUserMenuEvent("help_invite_users_question");
                    void handleHelpSubmit("How do I invite new users?", []);
                  }}
                />
                <DropdownMenuItem
                  label="How do I use agents in Slack workflow?"
                  icon={MessageTextCircle01}
                  onClick={() => {
                    trackUserMenuEvent("help_slack_workflow_question");
                    void handleHelpSubmit(
                      "How do I use agents in Slack workflow?",
                      []
                    );
                  }}
                />
                <DropdownMenuItem
                  label="How do I manage billing?"
                  icon={MessageTextCircle01}
                  onClick={() => {
                    trackUserMenuEvent("help_billing_question");
                    void handleHelpSubmit("How do I manage billing?", []);
                  }}
                />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem
            label="Dust Academy"
            icon={BookOpen01}
            href="https://dust.tt/academy"
            target="_blank"
            onClick={() => trackUserMenuEvent("dust_academy")}
          />

          {showExtensionMenu &&
            (isFirefox ? (
              <DropdownMenuItem
                label="Firefox extension"
                icon={FirefoxLogo}
                href="https://addons.mozilla.org/firefox/addon/dust/"
                target="_blank"
                onClick={() => trackUserMenuEvent("firefox_extension")}
              />
            ) : (
              <DropdownMenuItem
                label="Chrome extension"
                icon={ChromeLogo}
                href="https://chromewebstore.google.com/detail/dust/fnkfcndbgingjcbdhaofkcnhcjpljhdn"
                target="_blank"
                onClick={() => trackUserMenuEvent("chrome_extension")}
              />
            ))}

          {subscription?.plan.limits.canUseProduct && (
            <>
              <DropdownMenuItem
                label="Exploratory features"
                icon={Beaker02}
                href={`/w/${owner.sId}/labs`}
                onClick={() => trackUserMenuEvent("exploratory_features")}
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
                onSelect={() => {
                  trackUserMenuEvent("personal_settings");
                  setSettingsOpen(true);
                }}
              />
              <DropdownMenuItem
                label="Tools"
                icon={ShapesPlus}
                onSelect={() => {
                  trackUserMenuEvent("tools");
                  setToolsOpen(true);
                }}
              />
              <DropdownMenuItem
                label="Automations"
                icon={Clock}
                onSelect={() => {
                  trackUserMenuEvent("automations");
                  setAutomationsOpen(true);
                }}
              />
              {/* The credit usage card is the analytics entry point when shown; keep exactly one. */}
              {!creditUsageState && (
                <DropdownMenuItem
                  label="Analytics"
                  icon={BarChart01}
                  onSelect={() => {
                    trackUserMenuEvent("analytics");
                    setAnalyticsOpen(true);
                  }}
                />
              )}
            </>
          )}

          <DropdownMenuItem
            label="Sign&nbsp;out"
            icon={LogOut01}
            onClick={() => {
              trackUserMenuEvent("sign_out");

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
                    {!isOnlyManager(owner) && (
                      <DropdownMenuItem
                        label="Become Manager"
                        onClick={() => forceRoleUpdate("manager")}
                        icon={Star01}
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
