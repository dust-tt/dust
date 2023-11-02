import {
  Button,
  Cog6ToothIcon,
  ContextItem,
  DocumentPileIcon,
  FolderOpenIcon,
  Page,
  PlusIcon,
  SectionHeader,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { PlanType } from "@app/types/plan";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  plan: PlanType;
  readOnly: boolean;
  dataSources: DataSourceType[];
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);

  const user = await getUserFromSession(session);
  if (!user) {
    return {
      notFound: true,
    };
  }

  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const allDataSources = await getDataSources(auth);
  const dataSources = allDataSources.filter((ds) => !ds.connectorId);

  return {
    props: {
      user,
      owner,
      plan,
      readOnly,
      dataSources,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DataSourcesView({
  user,
  owner,
  plan,
  readOnly,
  dataSources,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const handleCreateDataSource = async () => {
    // Enforce plan limits: DataSources count.
    if (
      plan.limits.dataSources.count != -1 &&
      dataSources.length >= plan.limits.dataSources.count
    ) {
      window.alert(
        "You are limited to 1 DataSource on our free plan. Contact team@dust.tt if you want to increase this limit."
      );
      return;
    } else {
      void router.push(`/w/${owner.sId}/builder/data-sources/new`);
    }
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({
        owner,
        current: "data_sources_static",
      })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Data Sources"
          icon={DocumentPileIcon}
          description="Make more documents accessible to this workspace. Manage data sources manually or via API."
        />

        {dataSources.length > 0 ? (
          <SectionHeader
            title=""
            description=""
            action={
              !readOnly
                ? {
                    label: "Add a new Data Source",
                    variant: "primary",
                    icon: PlusIcon,
                    onClick: async () => {
                      await handleCreateDataSource();
                    },
                  }
                : undefined
            }
          />
        ) : (
          <div
            className={classNames(
              "mt-4 flex h-full min-h-48 items-center justify-center rounded-lg bg-structure-50"
            )}
          >
            <Button
              disabled={readOnly}
              size="md"
              label="Add a new Data Source"
              variant="primary"
              icon={PlusIcon}
              onClick={async () => {
                await handleCreateDataSource();
              }}
            />
          </div>
        )}

        <ContextItem.List>
          {dataSources.map((ds) => (
            <ContextItem
              key={ds.name}
              title={ds.name}
              visual={
                <ContextItem.Visual
                  visual={({ className }) =>
                    FolderOpenIcon({
                      className: className + " text-element-600",
                    })
                  }
                />
              }
              action={
                <Button.List>
                  <Button
                    variant="secondary"
                    icon={Cog6ToothIcon}
                    onClick={() => {
                      void router.push(
                        `/w/${owner.sId}/builder/data-sources/${ds.name}`
                      );
                    }}
                    label="Manage"
                  />
                </Button.List>
              }
            >
              <ContextItem.Description>
                <div className="text-sm text-element-700">{ds.description}</div>
              </ContextItem.Description>
            </ContextItem>
          ))}
        </ContextItem.List>
      </Page.Vertical>
    </AppLayout>
  );
}
