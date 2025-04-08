import { CommandIcon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { PersonalConnectionsList } from "@app/components/data_source/PersonalConnectionsList";
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
  if (!flags.includes("labs_personal_connections")) {
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
        pageTitle="Dust - Personal connections"
      >
        <Page.Vertical gap="xl" align="stretch">
          <Page.Header
            title="Personal connecttion"
            icon={CommandIcon}
            description="Connect your personal accounts on data sources."
          />
          <PersonalConnectionsList owner={owner} />
        </Page.Vertical>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
