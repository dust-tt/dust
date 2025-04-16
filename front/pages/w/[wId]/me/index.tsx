import { Page, UserIcon } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AccountSettings } from "@app/components/me/AccountSettings";
import { UserToolsTable } from "@app/components/me/UserToolsTable";
import AppLayout from "@app/components/sparkle/AppLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useUser } from "@app/lib/swr/user";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SubscriptionType, WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
    },
  };
});

export default function ProfilePage({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const { user, isUserLoading, mutateUser } = useUser();

  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Profile"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Page>
          <Page.Header title="Profile Settings" icon={UserIcon} />
          <Page.Layout direction="vertical">
            <Page.SectionHeader title="Account Settings" />
            <AccountSettings
              user={user}
              isUserLoading={isUserLoading}
              mutateUser={mutateUser}
            />

            {hasFeature("mcp_actions") && (
              <>
                <Page.SectionHeader
                  title="Tools Confirmation Preferences"
                  description="Manage your tool approbation history per action"
                />
                <UserToolsTable owner={owner} />
              </>
            )}
          </Page.Layout>
        </Page>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
