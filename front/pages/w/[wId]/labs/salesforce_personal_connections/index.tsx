import {
  Button,
  CloudArrowLeftRightIcon,
  Page,
  SalesforceLogo,
  Spinner,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import {
  useLabsCreateSalesforcePersonalConnection,
  useLabsDeleteSalesforcePersonalConnection,
  useLabsSalesforceDataSourcesWithPersonalConnection,
} from "@app/lib/swr/labs";
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
  const { dataSources, isLoading } =
    useLabsSalesforceDataSourcesWithPersonalConnection({
      owner,
    });
  const { createPersonalConnection } =
    useLabsCreateSalesforcePersonalConnection(owner);
  const { deletePersonalConnection } =
    useLabsDeleteSalesforcePersonalConnection(owner);

  const dataSource = dataSources[0];
  const isConnected = dataSource?.personalConnection !== null;

  return (
    <ConversationsNavigationProvider>
      <AppContentLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Salesforce personal connections"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Page>
          <Page.Header
            title="Salesforce personal connections"
            icon={SalesforceLogo}
            description="Connect your personal accounts on your Salesforce connector."
          />
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : dataSource ? (
            <>
              <Page.SectionHeader title="Connect your personal Salesforce account." />
              <div className="flex flex-row gap-2">
                {!isConnected && (
                  <Button
                    label={`Connect Salesforce`}
                    variant="outline"
                    size="sm"
                    icon={CloudArrowLeftRightIcon}
                    onClick={async () => {
                      await createPersonalConnection(dataSource);
                    }}
                  />
                )}
                {isConnected && (
                  <>
                    <Button
                      label="Salesforce connected"
                      size="sm"
                      icon={CloudArrowLeftRightIcon}
                      disabled={true}
                    />

                    <Button
                      label="Disconnect"
                      variant="outline"
                      size="sm"
                      icon={CloudArrowLeftRightIcon}
                      onClick={async () => {
                        await deletePersonalConnection(dataSource);
                      }}
                    />
                  </>
                )}
              </div>
            </>
          ) : (
            <Page.SectionHeader
              title="No Salesforce connector found. Please connect a Salesforce
              connector first."
            />
          )}
        </Page>
      </AppContentLayout>
    </ConversationsNavigationProvider>
  );
}

PersonalConnections.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
