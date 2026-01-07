import {
  BookOpenIcon,
  ChatBubbleBottomCenterTextIcon,
  ContentMessage,
  InformationCircleIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToolsIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import React from "react";
import { useCallback, useState } from "react";

import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import { SpaceAboutTab } from "@app/components/assistant/conversation/space/SpaceAboutTab";
import { SpaceConversationsTab } from "@app/components/assistant/conversation/space/SpaceConversationsTab";
import { SpaceKnowledgeTab } from "@app/components/assistant/conversation/space/SpaceKnowledgeTab";
import { SpaceToolsTab } from "@app/components/assistant/conversation/space/SpaceToolsTab";
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
import type { ContentFragmentsType, Result, RichMention } from "@app/types";
import { Err, Ok, toMentionType } from "@app/types";

export const getServerSideProps =
  withDefaultUserAuthRequirements<ConversationLayoutProps>(
    async (context, auth) => {
      const owner = auth.workspace();
      const user = auth.user()?.toJSON();
      const subscription = auth.subscription();
      const isAdmin = auth.isAdmin();

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

      return {
        props: {
          user,
          owner,
          isAdmin,
          subscription,
          baseUrl: config.getClientFacingUrl(),
          conversationId: null,
        },
      };
    }
  );

type SpaceTab = "conversations" | "knowledge" | "tools" | "about";

export default function SpaceConversations({
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const spaceId = useActiveSpaceId();
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });
  const router = useRouter();
  const activeConversationId = useActiveConversationId();
  const sendNotification = useSendNotification();
  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
  });

  const { conversations, mutateConversations } = useSpaceConversations({
    workspaceId: owner.sId,
    spaceId,
  });

  const planAllowsSCIM = subscription.plan.limits.users.isSCIMAllowed;
  const { groups } = useGroups({
    owner,
    kinds: ["provisioned"],
    disabled: !planAllowsSCIM,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [_planLimitReached, setPlanLimitReached] = useState(false);
  const [currentTab, setCurrentTab] = useState<SpaceTab>("conversations");

  // Sync current tab with URL hash
  React.useEffect(() => {
    const updateTabFromHash = () => {
      const hash = window.location.hash.slice(1); // Remove the # prefix
      if (
        hash === "knowledge" ||
        hash === "tools" ||
        hash === "about" ||
        hash === "conversations"
      ) {
        setCurrentTab(hash);
      } else {
        // No hash or invalid hash, set to conversations and update URL
        setCurrentTab("conversations");
        if (!window.location.hash) {
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}#conversations`
          );
        }
      }
    };

    // Update on mount
    updateTabFromHash();

    // Listen for hash changes
    window.addEventListener("hashchange", updateTabFromHash);
    return () => window.removeEventListener("hashchange", updateTabFromHash);
  }, []);

  const handleTabChange = useCallback((tab: SpaceTab) => {
    window.location.hash = tab;
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
    <div className="flex w-full items-center justify-center overflow-auto">
      <div className="flex max-h-dvh w-full flex-col gap-8 pb-2 pt-4 sm:w-full sm:max-w-3xl sm:pb-4">
        <div>
          <ContentMessage title="Experimental feature" variant="info" size="lg">
            <p>
              This feature is currently in alpha, and only available in the Dust
              workspace ("projects" feature flag). The goal is to get feedback
              from internal usage and quickly iterate. Share your feedback in
              the{" "}
              <Link
                href="https://dust4ai.slack.com/archives/C09T7N4S6GG"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600"
              >
                initiative slack channel
              </Link>
              .
            </p>
          </ContentMessage>
        </div>

        <div className="heading-xl text-xl">{spaceInfo?.name}</div>

        <Tabs
          value={currentTab}
          onValueChange={(value) => handleTabChange(value as SpaceTab)}
        >
          <TabsList>
            <TabsTrigger
              value="conversations"
              label="Conversations"
              icon={ChatBubbleBottomCenterTextIcon}
            />
            <TabsTrigger
              value="knowledge"
              label="Knowledge"
              icon={BookOpenIcon}
            />
            <TabsTrigger value="tools" label="Tools" icon={ToolsIcon} />
            <TabsTrigger
              value="about"
              label="About this project"
              icon={InformationCircleIcon}
            />
          </TabsList>

          <TabsContent value="conversations">
            <SpaceConversationsTab
              owner={owner}
              user={user}
              conversations={conversations}
              spaceInfo={spaceInfo}
              onSubmit={handleConversationCreation}
            />
          </TabsContent>

          <TabsContent value="knowledge">
            <SpaceKnowledgeTab />
          </TabsContent>

          <TabsContent value="tools">
            <SpaceToolsTab />
          </TabsContent>

          <TabsContent value="about">
            {spaceInfo && (
              <SpaceAboutTab
                owner={owner}
                space={spaceInfo}
                initialMembers={spaceInfo.members || []}
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
                initialManagementMode={spaceInfo.managementMode || "manual"}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
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
