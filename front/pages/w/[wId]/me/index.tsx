import {
  BellIcon,
  BoltIcon,
  Page,
  Separator,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  UserIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AccountSettings } from "@app/components/me/AccountSettings";
import { PendingInvitationsTable } from "@app/components/me/PendingInvitationsTable";
import { ProfileTriggersTab } from "@app/components/me/ProfileTriggersTab";
import { UserToolsTable } from "@app/components/me/UserToolsTable";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { usePendingInvitations } from "@app/lib/swr/user";
import type { PlanType, SubscriptionType, WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const plan = auth.plan();

  if (!owner || !subscription || !plan) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      plan,
    },
  };
});

export default function ProfilePage({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { pendingInvitations, isPendingInvitationsLoading } =
    usePendingInvitations({
      workspaceId: owner.sId,
    });

  if (isPendingInvitationsLoading) {
    return (
      <AppCenteredLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Profile"
        navChildren={<AgentSidebarMenu owner={owner} />}
      >
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AppCenteredLayout>
    );
  }

  return (
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      pageTitle="Dust - Profile"
      navChildren={<AgentSidebarMenu owner={owner} />}
    >
      <Page>
        <Page.Header title="Profile Settings" icon={UserIcon} />
        <Page.Layout direction="vertical">
          <Page.SectionHeader title="Account Settings" />
          <AccountSettings owner={owner} />

          {pendingInvitations.length > 0 && (
            <>
              <Separator />
              <Page.SectionHeader title="Pending Invitations" />
              <PendingInvitationsTable invitations={pendingInvitations} />
            </>
          )}

          <Separator />

          <Page.SectionHeader title="Tools & Triggers" />
          <Tabs defaultValue="tools" className="w-full">
            <TabsList>
              <TabsTrigger value="tools" label="Tools" icon={BoltIcon} />
              <TabsTrigger value="triggers" label="Triggers" icon={BellIcon} />
            </TabsList>
            <TabsContent value="tools" className="mt-4">
              <UserToolsTable owner={owner} />
            </TabsContent>
            <TabsContent value="triggers" className="mt-4">
              <ProfileTriggersTab owner={owner} />
            </TabsContent>
          </Tabs>
        </Page.Layout>
      </Page>
    </AppCenteredLayout>
  );
}

ProfilePage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
