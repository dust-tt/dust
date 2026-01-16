import { datadogLogs } from "@datadog/browser-logs";
import {
  Avatar,
  ChatBubbleBottomCenterPlusIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ChromeLogo,
  cn,
  DocumentIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  EyeIcon,
  EyeSlashIcon,
  HeartIcon,
  Icon,
  LightbulbIcon,
  LogoutIcon,
  ShapesIcon,
  SlackLogo,
  StarIcon,
  TestTubeIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useCallback, useContext, useMemo } from "react";

import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useConversationDrafts } from "@app/components/assistant/conversation/input_bar/useConversationDrafts";
import { WorkspacePickerRadioGroup } from "@app/components/WorkspacePicker";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { usePrivacyMask } from "@app/hooks/usePrivacyMask";
import { useSubmitFunction } from "@app/lib/client/utils";
import {
  forceUserRole,
  sendOnboardingConversation,
  showDebugTools,
} from "@app/lib/development";
import { serializeMention } from "@app/lib/mentions/format";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type { AgentMention, MentionType } from "@app/types";
import type {
  SubscriptionType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@app/types";
import { GLOBAL_AGENTS_SID, isAgentMention } from "@app/types";
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
  const privacyMask = usePrivacyMask();
  const { clearAllDraftsFromUser } = useConversationDrafts({
    workspaceId: owner.sId,
    userId: user.sId,
    conversationId: null,
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

  // Check if user has multiple workspaces
  const hasMultipleWorkspaces = useMemo(() => {
    return user.organizations && user.organizations.length > 1;
  }, [user]);

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const { setSelectedAgent } = useContext(InputBarContext);

  const handleAskHelp = useCallback(() => {
    if (router.pathname === "/w/[wId]/conversation/[cId]") {
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
  }, [router, owner.sId, setSelectedAgent]);

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
      [createConversationWithMessage, owner.sId, router, sendNotification]
    )
  );

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
            label="Profile"
            icon={UserIcon}
            href={`/w/${owner.sId}/me`}
          />
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={HeartIcon} label="Help & Support" />
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuLabel label="Learn about Dust" />
              <DropdownMenuItem
                label="Quickstart Guide"
                icon={LightbulbIcon}
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
                icon={DocumentIcon}
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
                description="Ask anything about Dust"
                icon={ChatBubbleLeftRightIcon}
                onClick={() => void handleAskHelp()}
              />
              <DropdownMenuItem
                label="How to invite new users?"
                icon={ChatBubbleBottomCenterTextIcon}
                onClick={() =>
                  void handleHelpSubmit("How to invite new users?", [])
                }
              />
              <DropdownMenuItem
                label="How to use agents in Slack workflow?"
                icon={ChatBubbleBottomCenterTextIcon}
                onClick={() =>
                  void handleHelpSubmit(
                    "How to use agents in Slack workflow?",
                    []
                  )
                }
              />
              <DropdownMenuItem
                label="How to manage billing?"
                icon={ChatBubbleBottomCenterTextIcon}
                onClick={() =>
                  void handleHelpSubmit("How to manage billing?", [])
                }
              />
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          label="Sign&nbsp;out"
          icon={LogoutIcon}
          onClick={() => {
            // Clear all conversation drafts for this user.
            clearAllDraftsFromUser();

            datadogLogs.clearUser();
            window.DD_RUM.onReady(() => {
              window.DD_RUM.clearUser();
            });
            window.location.href = "/api/workos/logout";
          }}
        />

        {showDebugTools(featureFlags) && (
          <>
            <DropdownMenuLabel label="Advanced" />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger label="Dev Tools" icon={ShapesIcon} />
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {router.route === "/w/[wId]/conversation/[cId]" && (
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
