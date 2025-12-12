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

import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AccountSettings } from "@app/components/me/AccountSettings";
import { NotificationPreferences } from "@app/components/me/NotificationPreferences";
import { PendingInvitationsTable } from "@app/components/me/PendingInvitationsTable";
import { ProfileTriggersTab } from "@app/components/me/ProfileTriggersTab";
import { UserToolsTable } from "@app/components/me/UserToolsTable";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getMembershipInvitationToken } from "@app/lib/api/invitation";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { useUser } from "@app/lib/swr/user";
import type { SubscriptionType, WorkspaceType } from "@app/types";
import type { PendingInvitationOption } from "@app/types/membership_invitation";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  pendingInvitations: PendingInvitationOption[];
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const userResource = auth.user();

  if (!owner || !subscription || !userResource) {
    return {
      notFound: true,
    };
  }

  const invitationResources =
    await MembershipInvitationResource.listPendingForEmail({
      email: userResource.email,
    });

  const pendingInvitations: PendingInvitationOption[] = invitationResources.map(
    (invitation) => {
      const workspace = invitation.workspace;

      return {
        workspaceName: workspace.name,
        initialRole: invitation.initialRole,
        createdAt: invitation.createdAt.getTime(),
        token: getMembershipInvitationToken(invitation.toJSON()),
        isExpired: invitation.isExpired(),
      };
    }
  );

  return {
    props: {
      owner,
      subscription,
      pendingInvitations,
    },
  };
});

export default function ProfilePage({
  owner,
  subscription,
  pendingInvitations,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { user, isUserLoading } = useUser();

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
          <AccountSettings
            user={user}
            isUserLoading={isUserLoading}
            owner={owner}
          />

          {pendingInvitations.length > 0 && (
            <>
              <Separator />
              <Page.SectionHeader title="Pending Invitations" />
              <PendingInvitationsTable invitations={pendingInvitations} />
            </>
          )}
          {user?.subscriberHash && (
            <>
              <Separator />
              <Page.SectionHeader title="Notifications" />
              <NotificationPreferences />
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
