import {
  ArrowUpOnSquareIcon,
  Button,
  CloudArrowLeftRightIcon,
  ContextItem,
  DocumentPileIcon,
  Item,
  Modal,
  Page,
  SectionHeader,
} from "@dust-tt/sparkle";
import { PlusIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { CoreAPIDatabase } from "@app/lib/core_api";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { useDatabases } from "@app/lib/swr";
import { DataSourceType } from "@app/types/data_source";
import { SubscriptionType } from "@app/types/plan";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  owner: WorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (
    !owner ||
    !auth.isBuilder() ||
    !isDevelopmentOrDustWorkspace(owner) ||
    !subscription ||
    !user
  ) {
    return {
      notFound: true,
    };
  }

  const datasources = await getDataSources(auth);

  return {
    props: {
      user,
      owner,
      subscription,
      dataSources: datasources,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppDatabases({
  user,
  owner,
  dataSources,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [selectedDatabase, setSelectedDatabase] =
    React.useState<CoreAPIDatabase | null>(null);
  const [selectedDataSource, setSelectedDataSource] =
    React.useState<DataSourceType | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const onModalClose = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setSelectedDatabase(null);
      setSelectedDataSource(null);
    }, 500);
  };

  const dbsByDs: Record<string, CoreAPIDatabase[]> = {};
  for (const ds of dataSources) {
    const { databases } = useDatabases({
      workspaceId: owner.sId,
      dataSourceName: ds.name,
      offset: 0,
      limit: 100,
    });
    if (databases) {
      dbsByDs[ds.name] = databases;
    }
  }

  // order by those that have the most databases
  const entries = Object.entries(dbsByDs)
    .sort(([, a], [, b]) => b.length - a.length)
    .filter(
      // remove managed data sources that don't have any databases
      ([dsName, dbs]) =>
        dbs.length > 0 ||
        !dataSources.find((ds) => ds.name === dsName)?.connectorProvider
    );

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "databases" })}
    >
      <DatabaseModal
        onClose={onModalClose}
        isOpen={isModalOpen}
        database={selectedDatabase}
        // guaranteed to be set in the onClick handler
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        dataSource={selectedDataSource!}
      />
      <Page.Header
        title="Databases"
        icon={ArrowUpOnSquareIcon}
        description="Databases are used to store structured data."
      />

      <div>
        <SectionHeader
          title="Your worskpace's databases"
          description="Below are the databases that are available in your workspace in each datasource."
        />
        <div className="mt-8">
          {entries.map(([dsName, dbs]) => {
            const ds = dataSources.find((ds) => ds.name === dsName);
            if (!ds) {
              return null;
            }
            return (
              <div key={dsName}>
                <div className="flex flex-row space-x-4 pt-8">
                  <ContextItem
                    key={dsName}
                    title={dsName}
                    action={
                      !ds.connectorProvider ? (
                        <Button
                          icon={PlusIcon}
                          labelVisible={false}
                          label={"Add database"}
                          size="xs"
                          variant="secondary"
                          onClick={() => {
                            setSelectedDataSource(ds);
                            setIsModalOpen(true);
                          }}
                        />
                      ) : null
                    }
                    visual={
                      <ContextItem.Visual
                        visual={
                          ds.connectorProvider
                            ? CloudArrowLeftRightIcon
                            : DocumentPileIcon
                        }
                      />
                    }
                  />
                </div>

                <div className="mt-4">
                  {dbs.map((db) => {
                    return (
                      <div key={`${dsName}-${db.name}`}>
                        <Item
                          label={db.name}
                          style="action"
                          onClick={() => {
                            setSelectedDatabase(db);
                            setSelectedDataSource(ds);
                            setIsModalOpen(true);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}

function DatabaseModal({
  isOpen,
  onClose,
  database,
  dataSource,
}: {
  isOpen: boolean;
  onClose: () => void;
  database: CoreAPIDatabase | null;
  dataSource: DataSourceType;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hasChanged={false}
      variant="side-md"
      title={database ? "Edit database" : "Create database"}
    >
      <div className="mx-auto flex max-w-3xl">
        <div className="w-full pt-12">
          {JSON.stringify(database || dataSource, null, 2)}
        </div>
      </div>
    </Modal>
  );
}
