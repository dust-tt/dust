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

import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AccountSettings } from "@app/components/me/AccountSettings";
import { PendingInvitationsTable } from "@app/components/me/PendingInvitationsTable";
import { ProfileTriggersTab } from "@app/components/me/ProfileTriggersTab";
import { UserToolsTable } from "@app/components/me/UserToolsTable";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { useAuth } from "@app/lib/auth/AuthContext";
import { usePendingInvitations } from "@app/lib/swr/user";

export function ProfilePage() {
  const { workspace: owner, subscription } = useAuth();

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
