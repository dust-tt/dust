import {
  ActionCodeBoxIcon,
  BookOpenIcon,
  ContextItem,
  EyeIcon,
  Icon,
  Page,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { FeatureAccessButton } from "@app/components/labs/FeatureAccessButton";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type {
  LabsFeatureItemType,
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";

const LABS_FEATURES: LabsFeatureItemType[] = [
  {
    id: "transcripts",
    label: "Meeting Transcripts Processing",
    featureFlag: "labs_transcripts",
    visibleWithoutAccess: true,
    icon: EyeIcon,
    description:
      "Receive meeting minutes processed by email automatically and store them in a Dust Folder.",
  },
  {
    id: "trackers",
    label: "Document Tracker",
    featureFlag: "labs_trackers",
    visibleWithoutAccess: false,
    icon: BookOpenIcon,
    description:
      "Document monitoring made simple - receive alerts when documents are out of date.",
    onlyAdminCanManage: false,
  },
  {
    id: "mcp_actions",
    label: "MCP Actions Dashboard",
    featureFlag: "labs_mcp_actions_dashboard",
    visibleWithoutAccess: false,
    icon: ActionCodeBoxIcon,
    description:
      "Monitor and track MCP (Model Context Protocol) actions executed by your agents.",
    onlyAdminCanManage: true,
  },
];

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  featureFlags: WhitelistableFeature[];
  isAdmin: boolean;
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
      isAdmin: auth.isAdmin(),
    },
  };
});

const getVisibleFeatures = (featureFlags: WhitelistableFeature[]) => {
  return LABS_FEATURES.filter(
    (feature) =>
      feature.visibleWithoutAccess || featureFlags.includes(feature.featureFlag)
  );
};

export default function LabsTranscriptsIndex({
  owner,
  subscription,
  featureFlags,
  isAdmin,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const visibleFeatures = getVisibleFeatures(featureFlags);

  return (
    <ConversationsNavigationProvider>
      <AppCenteredLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Exploratory features"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Page.Header
          title="Exploratory features"
          icon={TestTubeIcon}
          description="Expect some bumps and changes. Feedback welcome, tell us what you think!"
        />
        <Page.Layout direction="vertical">
          <ContextItem.List>
            <ContextItem.SectionHeader
              title="Features"
              description="All features presented here are in beta and may change or be removed."
            />

            {visibleFeatures.map((item) => (
              <ContextItem
                key={item.id}
                title={item.label}
                action={
                  <FeatureAccessButton
                    accessible={featureFlags.includes(item.featureFlag)}
                    featureName={item.label}
                    managePath={`/w/${owner.sId}/labs/${item.id}`}
                    owner={owner}
                    canRequestAccess={isAdmin}
                    canManage={!item.onlyAdminCanManage || isAdmin}
                  />
                }
                visual={<Icon visual={item.icon} />}
              >
                <ContextItem.Description description={item.description} />
              </ContextItem>
            ))}
          </ContextItem.List>
        </Page.Layout>
      </AppCenteredLayout>
    </ConversationsNavigationProvider>
  );
}

LabsTranscriptsIndex.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
