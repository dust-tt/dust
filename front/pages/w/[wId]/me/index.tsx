import {
  BellIcon,
  BoltIcon,
  Page,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  UserIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AccountSettings } from "@app/components/me/AccountSettings";
import { ProfileTriggersTab } from "@app/components/me/ProfileTriggersTab";
import { UserToolsTable } from "@app/components/me/UserToolsTable";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
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
  const { user, isUserLoading } = useUser();
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

  return (
    <ConversationsNavigationProvider>
      <AppCenteredLayout
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
              owner={owner}
            />

            <Separator />

            <Page.SectionHeader
              title={
                hasFeature("hootl_subscriptions") ? "Tools & Triggers" : "Tools"
              }
            />
            <Tabs defaultValue="tools" className="w-full">
              <TabsList>
                <TabsTrigger value="tools" label="Tools" icon={BoltIcon} />
                {hasFeature("hootl_subscriptions") && (
                  <TabsTrigger
                    value="triggers"
                    label="Triggers"
                    icon={BellIcon}
                  />
                )}
              </TabsList>
              <TabsContent value="tools" className="mt-4">
                <UserToolsTable owner={owner} />
              </TabsContent>
              {hasFeature("hootl_subscriptions") && (
                <TabsContent value="triggers" className="mt-4">
                  <ProfileTriggersTab owner={owner} />
                </TabsContent>
              )}
            </Tabs>
          </Page.Layout>
        </Page>
      </AppCenteredLayout>
    </ConversationsNavigationProvider>
  );
}

ProfilePage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
