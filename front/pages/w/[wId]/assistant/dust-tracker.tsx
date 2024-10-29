import { Page } from "@dust-tt/sparkle";
import type { SubscriptionType, UserType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { DocumentMagnifyingGlassIcon } from "@heroicons/react/20/solid";
import type { InferGetServerSidePropsType } from "next";

import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const user = auth.user();
  const subscription = auth.subscription();

  if (
    !owner ||
    !owner.flags.includes("document_tracker") ||
    !user ||
    !subscription
  ) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      user,
      subscription,
    },
  };
});

export default function DustTracker({
  owner,
  user,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      pageTitle="Dust - Tracker"
      navChildren={<AssistantSidebarMenu owner={owner} />}
    >
      <Page>
        <Page.Header
          title="Dust Tracker"
          icon={DocumentMagnifyingGlassIcon}
          description="Get notified when a document you maintain might require your attention."
        />
        <div>Hello world</div>
      </Page>
    </AppLayout>
  );
}
