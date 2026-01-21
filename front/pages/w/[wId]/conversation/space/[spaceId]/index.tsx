import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import React, { useCallback, useState } from "react";

import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import { SpaceAboutTab } from "@app/components/assistant/conversation/space/about/SpaceAboutTab";
import { SpaceConversationsTab } from "@app/components/assistant/conversation/space/conversations/SpaceConversationsTab";
import { SpaceContextTab } from "@app/components/assistant/conversation/space/SpaceContextTab";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import type { DustError } from "@app/lib/error";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { useSpaceConversations } from "@app/lib/swr/conversations";
import { useGroups } from "@app/lib/swr/groups";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  ContentFragmentsType,
  PlanType,
  Result,
  RichMention,
  SpaceType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, Ok, toMentionType } from "@app/types";

export interface ProjectLayoutProps {
  baseUrl: string;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
  isAdmin: boolean;

  canReadInSpace: boolean;
  canWriteInSpace: boolean;
  plan: PlanType;
  systemSpace: SpaceType;
}

export const getServerSideProps =
  withDefaultUserAuthRequirements<ProjectLayoutProps>(async (context, auth) => {
    const owner = auth.workspace();
    const user = auth.user()?.toJSON();
    const subscription = auth.subscription();
    const isAdmin = auth.isAdmin();
    const plan = auth.plan();

    if (!owner || !user || !auth.isUser() || !subscription) {
      return {
        redirect: {
          destination: "/",
          permanent: false,
        },
      };
    }

    const { spaceId } = context.params;
    if (typeof spaceId !== "string") {
      return {
        notFound: true,
      };
    }

    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space || !space.canReadOrAdministrate(auth)) {
      return {
        notFound: true,
      };
    }

    if (!plan) {
      return {
        notFound: true,
      };
    }

    const systemSpace = (
      await SpaceResource.fetchWorkspaceSystemSpace(auth)
    ).toJSON();
    const canWriteInSpace = space.canWrite(auth);
    const canReadInSpace = space.canRead(auth);

    return {
      props: {
        user,
        owner,
        isAdmin,
        subscription,
        systemSpace,
        plan,
        canWriteInSpace,
        canReadInSpace,
        baseUrl: config.getClientFacingUrl(),
      },
    };
  });

type SpaceTab = "conversations" | "context" | "settings";

export default function SpaceConversations({
  owner,
  subscription,
  user,
  isAdmin,
  systemSpace,
  plan,
  canWriteInSpace,
  canReadInSpace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });
  const router = useRouter();
  const activeConversationId = useActiveConversationId();
  const spaceId = useActiveSpaceId();
  const sendNotification = useSendNotification();
  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: spaceId,
  });

  const { conversations, isConversationsLoading, mutateConversations } =
    useSpaceConversations({
      workspaceId: owner.sId,
      spaceId: spaceId,
    });

  const planAllowsSCIM = subscription.plan.limits.users.isSCIMAllowed;
  const { groups } = useGroups({
    owner,
    kinds: ["provisioned"],
    disabled: !planAllowsSCIM,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [_planLimitReached, setPlanLimitReached] = useState(false);

  // Parse and validate the current tab from URL hash
  const getCurrentTabFromHash = useCallback((): SpaceTab => {
    const hash = window.location.hash.slice(1); // Remove the # prefix
    if (hash === "context" || hash === "settings" || hash === "conversations") {
      return hash;
    }
    return "conversations";
  }, []);

  const [currentTab, setCurrentTab] = useState<SpaceTab>(getCurrentTabFromHash);

  // Sync current tab with URL hash
  React.useEffect(() => {
    const updateTabFromHash = () => {
      const newTab = getCurrentTabFromHash();
      setCurrentTab(newTab);

      // Ensure URL has a hash
      if (!window.location.hash) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}#${newTab}`
        );
      }
    };

    // Update on mount
    updateTabFromHash();

    // Listen for hash changes
    window.addEventListener("hashchange", updateTabFromHash);
    return () => window.removeEventListener("hashchange", updateTabFromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount and cleanup on unmount

  const handleTabChange = useCallback((tab: SpaceTab) => {
    // Use replaceState to avoid adding to browser history for each tab switch
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${tab}`
    );
    setCurrentTab(tab);
  }, []);

  const handleConversationCreation = useCallback(
    async (
      input: string,
      mentions: RichMention[],
      contentFragments: ContentFragmentsType,
      selectedMCPServerViewIds?: string[]
    ): Promise<Result<undefined, DustError>> => {
      if (isSubmitting) {
        return new Err({
          code: "internal_error",
          name: "AlreadySubmitting",
          message: "Already submitting",
        });
      }

      setIsSubmitting(true);

      const conversationRes = await createConversationWithMessage({
        messageData: {
          input,
          mentions: mentions.map(toMentionType),
          contentFragments,
          selectedMCPServerViewIds,
        },
        spaceId,
      });

      setIsSubmitting(false);

      if (conversationRes.isErr()) {
        if (conversationRes.error.type === "plan_limit_reached_error") {
          setPlanLimitReached(true);
        } else {
          sendNotification({
            title: conversationRes.error.title,
            description: conversationRes.error.message,
            type: "error",
          });
        }

        return new Err({
          code: "internal_error",
          name: conversationRes.error.title,
          message: conversationRes.error.message,
        });
      } else {
        // Navigate to the new conversation
        await router.push(
          getConversationRoute(owner.sId, conversationRes.value.sId),
          undefined,
          { shallow: true }
        );

        // Update the conversations list
        await mutateConversations(
          (currentData) => {
            return {
              ...currentData,
              conversations: [
                ...(currentData?.conversations ?? []),
                conversationRes.value,
              ],
            };
          },
          { revalidate: false }
        );

        return new Ok(undefined);
      }
    },
    [
      isSubmitting,
      owner,
      spaceId,
      setPlanLimitReached,
      sendNotification,
      router,
      mutateConversations,
      createConversationWithMessage,
    ]
  );

  if (activeConversationId) {
    return (
      <ConversationContainerVirtuoso
        owner={owner}
        subscription={subscription}
        user={user}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <Tabs
        value={currentTab}
        onValueChange={(value) => handleTabChange(value as SpaceTab)}
        className="flex min-h-0 flex-1 flex-col pt-3"
      >
        <TabsList className="px-6">
          <TabsTrigger
            value="conversations"
            label="Conversations"
            icon={ChatBubbleLeftRightIcon}
          />
          <TabsTrigger value="context" label="Context" icon={BookOpenIcon} />
          <TabsTrigger value="settings" label="Settings" icon={Cog6ToothIcon} />
        </TabsList>

        <TabsContent value="conversations">
          {spaceInfo && (
            <SpaceConversationsTab
              owner={owner}
              user={user}
              conversations={conversations}
              isConversationsLoading={isConversationsLoading}
              spaceInfo={spaceInfo}
              onSubmit={handleConversationCreation}
            />
          )}
        </TabsContent>

        <TabsContent value="context">
          {spaceInfo && (
            <SpaceContextTab
              owner={owner}
              space={spaceInfo}
              systemSpace={systemSpace}
              plan={plan}
              isAdmin={isAdmin}
              canReadInSpace={canReadInSpace}
              canWriteInSpace={canWriteInSpace}
            />
          )}
        </TabsContent>

        <TabsContent value="settings">
          {spaceInfo && (
            <SpaceAboutTab
              key={spaceId}
              owner={owner}
              space={spaceInfo}
              initialMembers={spaceInfo.members}
              planAllowsSCIM={planAllowsSCIM}
              initialGroups={
                planAllowsSCIM &&
                spaceInfo.groupIds &&
                spaceInfo.groupIds.length > 0 &&
                groups
                  ? groups.filter((group) =>
                      spaceInfo.groupIds.includes(group.sId)
                    )
                  : []
              }
              initialManagementMode={spaceInfo.managementMode}
              initialIsRestricted={spaceInfo.isRestricted}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

SpaceConversations.getLayout = (
  page: ReactElement,
  pageProps: ConversationLayoutProps
) => {
  return (
    <AppRootLayout>
      <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>
    </AppRootLayout>
  );
};
