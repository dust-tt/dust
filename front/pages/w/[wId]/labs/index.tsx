import {
  BookOpenIcon,
  Button,
  Cog6ToothIcon,
  ContextItem,
  EyeIcon,
  HubspotLogo,
  Icon,
  Page,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { FeatureAccessButton } from "@app/components/labs/FeatureAccessButton";
import { RequestFeatureAccessModal } from "@app/components/labs/RequestFeatureAccessModal";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type {
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  featureFlags: WhitelistableFeature[];
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  if (!owner || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const featureFlags = await getFeatureFlags(owner);

  return {
    props: {
      owner,
      subscription,
      featureFlags,
    },
  };
});

export default function LabsTranscriptsIndex({
  owner,
  subscription,
  featureFlags,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Transcripts processing"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Page>
          <Page.Header
            title="Beta features"
            icon={TestTubeIcon}
            description="Expect some bumps and changes. Feedback welcome, tell us what you think!"
          />
          <Page.Layout direction="vertical">
            <ContextItem.List>
              <ContextItem.SectionHeader
                title="Features"
                description="All features presented here are in beta and may change or be removed."
              />
              <ContextItem
                title="Meeting Transcripts Processing"
                action={
                  <FeatureAccessButton
                    accessible={featureFlags.includes("labs_transcripts")}
                    featureName="Meeting Transcripts Processing"
                    managePath={`/w/${owner.sId}/labs/transcripts`}
                    owner={owner}
                  />
                }
                visual={<Icon visual={EyeIcon} />}
              >
                <ContextItem.Description
                  description="Receive meeting minutes processed by email automatically and
                  store them in a Dust Folder."
                />
              </ContextItem>

              <ContextItem
                title="Document Tracker"
                action={
                  <FeatureAccessButton
                    accessible={featureFlags.includes("labs_trackers")}
                    featureName="Document Tracker"
                    managePath={`/w/${owner.sId}/labs/trackers`}
                    owner={owner}
                  />
                }
                visual={<Icon visual={BookOpenIcon} />}
              >
                <ContextItem.Description description="Document monitoring made simple - receive alerts when documents are out of date." />
              </ContextItem>

              <ContextItem.SectionHeader
                title="Connections"
                description="These connections are being tested and may require some manual steps."
              />

              <ContextItem
                title="Hubspot"
                action={
                  <FeatureAccessButton
                    accessible={featureFlags.includes(
                      "labs_connection_hubspot"
                    )}
                    featureName="Hubspot connection"
                    managePath={`/w/${owner.sId}/labs/connections/hubspot`}
                    owner={owner}
                  />
                }
                visual={<ContextItem.Visual visual={HubspotLogo} />}
              >
                <ContextItem.Description description="Import your Hubspot data into Dust." />
              </ContextItem>
            </ContextItem.List>
          </Page.Layout>
        </Page>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
