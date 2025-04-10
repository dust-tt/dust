import { Page, SalesforceLogo } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { LabsSalesforcePersonalConnectionsList } from "@app/components/data_source/LabsSalesforcePersonalConnectionsList";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type { SubscriptionType, WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.getNonNullableUser();

  if (!owner || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const flags = await getFeatureFlags(owner);
  if (!flags.includes("labs_salesforce_personal_connections")) {
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

export default function PersonalConnections({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Salesforce personal connections"
      >
        <Page.Vertical gap="xl" align="stretch">
          <Page.Header
            title="Salesforce personal connections"
            icon={SalesforceLogo}
            description="Connect your personal accounts on your Salesforce connector."
          />
          <LabsSalesforcePersonalConnectionsList owner={owner} />
        </Page.Vertical>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
