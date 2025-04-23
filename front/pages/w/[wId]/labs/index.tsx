import {
  BookOpenIcon,
  Chip,
  ContextItem,
  EyeIcon,
  HubspotLogo,
  Icon,
  JiraLogo,
  LinearLogo,
  Page,
  SalesforceLogo,
  Spinner,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { FeatureAccessButton } from "@app/components/labs/FeatureAccessButton";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useLabsConnectionConfigurations } from "@app/lib/swr/labs";
import { useSpaces } from "@app/lib/swr/spaces";
import { timeAgoFrom } from "@app/lib/utils";
import type {
  LabsConnectionItemType,
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
    visibleWithoutAccess: true,
    icon: BookOpenIcon,
    description:
      "Document monitoring made simple - receive alerts when documents are out of date.",
  },
  {
    id: "salesforce_personal_connections",
    label: "Salesforce Personal Connections",
    featureFlag: "labs_salesforce_personal_connections",
    visibleWithoutAccess: false,
    icon: SalesforceLogo,
    description:
      "Connect your Salesforce personal accounts to Dust. We'll use your credentials to fetch data from Salesforce connector.",
  },
];
const LABS_CONNECTIONS: LabsConnectionItemType[] = [
  {
    id: "hubspot",
    label: "Hubspot",
    featureFlag: "labs_connection_hubspot",
    visibleWithoutAccess: true,
    logo: HubspotLogo,
    description: "Import Hubspot account summaries into Dust.",
    authType: "apiKey",
  },
  {
    id: "linear",
    label: "Linear",
    featureFlag: "labs_connection_linear",
    visibleWithoutAccess: false,
    logo: LinearLogo,
    description: "Import Linear issues summaries into Dust.",
    authType: "apiKey",
  },
  {
    id: "jira",
    label: "Jira",
    featureFlag: "labs_connection_jira",
    visibleWithoutAccess: true,
    logo: JiraLogo,
    description: "Import Jira issues into Dust.",
    authType: "apiKey",
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

const getVisibleConnections = (featureFlags: WhitelistableFeature[]) => {
  return LABS_CONNECTIONS.filter(
    (connection) =>
      connection.visibleWithoutAccess ||
      featureFlags.includes(connection.featureFlag)
  ).sort((a, b) => a.id.localeCompare(b.id));
};
export default function LabsTranscriptsIndex({
  owner,
  subscription,
  featureFlags,
  isAdmin,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const visibleConnections = getVisibleConnections(featureFlags);
  const visibleFeatures = getVisibleFeatures(featureFlags);
  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
  });
  const { dataSourceViews } = useDataSourceViews(owner);
  const { configurations, isConfigurationsLoading } =
    useLabsConnectionConfigurations({
      workspaceId: owner.sId,
    });

  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Exploratory features"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Page>
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
                    />
                  }
                  visual={<Icon visual={item.icon} />}
                >
                  <ContextItem.Description description={item.description} />
                </ContextItem>
              ))}

              {isAdmin && visibleConnections.length > 0 && (
                <>
                  <ContextItem.SectionHeader
                    title="Connections"
                    description="These connections are being tested and may require some manual steps."
                  />

                  {visibleConnections.map((item) => {
                    const existingConfig = configurations?.find(
                      (c) => c.provider === item.id
                    );

                    return (
                      <ContextItem
                        key={item.id}
                        title={item.label}
                        action={
                          <div className="flex items-center gap-2">
                            {existingConfig &&
                              (existingConfig.lastSyncError ? (
                                <Chip color="warning">
                                  Error: {existingConfig.lastSyncError}
                                </Chip>
                              ) : existingConfig.syncStatus === "running" ? (
                                <Chip color="info" isBusy>
                                  Synchronizing
                                </Chip>
                              ) : existingConfig.lastSyncCompletedAt !==
                                null ? (
                                <Chip>
                                  Last Sync:{" "}
                                  {timeAgoFrom(
                                    new Date(
                                      existingConfig.lastSyncCompletedAt
                                    ).getTime()
                                  )}{" "}
                                  ago
                                </Chip>
                              ) : (
                                <Chip color="warning">Last sync: Never</Chip>
                              ))}
                            {isConfigurationsLoading ? (
                              <Spinner />
                            ) : (
                              <FeatureAccessButton
                                accessible={featureFlags.includes(
                                  item.featureFlag
                                )}
                                featureName={`${item.label} connection`}
                                owner={owner}
                                canRequestAccess={isAdmin}
                                connection={item}
                                dataSourcesViews={dataSourceViews}
                                spaces={spaces}
                                isSpacesLoading={isSpacesLoading}
                                existingConfigurations={configurations}
                              />
                            )}
                          </div>
                        }
                        visual={<ContextItem.Visual visual={item.logo} />}
                      >
                        <ContextItem.Description
                          description={item.description}
                        />
                      </ContextItem>
                    );
                  })}
                </>
              )}
            </ContextItem.List>
          </Page.Layout>
        </Page>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
