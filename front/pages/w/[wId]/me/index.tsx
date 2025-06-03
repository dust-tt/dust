import { Page, Separator, UserIcon } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AccountSettings } from "@app/components/me/AccountSettings";
import { Preferences } from "@app/components/me/Preferences";
import { UserToolsTable } from "@app/components/me/UserToolsTable";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useUser } from "@app/lib/swr/user";
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

  return (
    <ConversationsNavigationProvider>
      <AppContentLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Profile"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Page>
          <Page.Header title="Profile Settings" icon={UserIcon} />
          <Page.Layout direction="vertical">
            <Page.SectionHeader title="Account Settings" />
            <AccountSettings user={user} isUserLoading={isUserLoading} />

            <Separator />

            <Page.SectionHeader title="Preferences" />
            <Preferences />

            <Separator />

            <Page.SectionHeader title="Tools Connections & Confirmation Preferences" />
            <UserToolsTable owner={owner} />
          </Page.Layout>
        </Page>
      </AppContentLayout>
    </ConversationsNavigationProvider>
  );
}

ProfilePage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
