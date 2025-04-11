import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { SpaceDataSourceViewContentList } from "@app/components/spaces/SpaceDataSourceViewContentList";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import AppHeadLayout from "@app/components/sparkle/AppHeadLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type {
  ConnectorType,
  DataSourceType,
  DataSourceViewCategory,
  DataSourceViewType,
  SpaceType,
} from "@app/types";
import { ConnectorsAPI } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<
  SpaceLayoutPageProps & {
    category: DataSourceViewCategory;
    dataSource: DataSourceType;
    dataSourceView: DataSourceViewType;
    parentId?: string;
    systemSpace: SpaceType;
    connector: ConnectorType | null;
  }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const plan = auth.plan();

  if (!subscription || !plan) {
    return {
      notFound: true,
    };
  }

  const { spaceId } = context.query;
  if (typeof spaceId !== "string") {
    return {
      notFound: true,
    };
  }

  const { dataSourceViewId } = context.query;
  if (typeof dataSourceViewId !== "string") {
    return {
      notFound: true,
    };
  }
  const isAdmin = auth.isAdmin();
  const parentId = context.query?.parentId as string | undefined;

  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    dataSourceViewId,
    { includeEditedBy: true }
  );

  if (
    !dataSourceView ||
    dataSourceView.space.sId !== spaceId ||
    !dataSourceView.canReadOrAdministrate(auth)
  ) {
    return {
      notFound: true,
    };
  }

  const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
  const { space } = dataSourceView;
  const canWriteInSpace = space.canWrite(auth);
  const canReadInSpace = space.canRead(auth);

  let connector: ConnectorType | null = null;
  if (dataSourceView.dataSource.connectorId) {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorRes = await connectorsAPI.getConnector(
      dataSourceView.dataSource.connectorId
    );
    if (connectorRes.isOk()) {
      connector = connectorRes.value;
    }
  }

  return {
    props: {
      category: context.query.category as DataSourceViewCategory,
      dataSource: dataSourceView.dataSource.toJSON(),
      dataSourceView: dataSourceView.toJSON(),
      isAdmin,
      canWriteInSpace,
      canReadInSpace,
      owner,
      // undefined is not allowed in the JSON response
      ...(parentId && { parentId }),
      plan,
      subscription,
      space: space.toJSON(),
      systemSpace: systemSpace.toJSON(),
      connector,
    },
  };
});

export default function Space({
  space,
  category,
  dataSourceView,
  canWriteInSpace,
  canReadInSpace,
  owner,
  parentId,
  plan,
  isAdmin,
  systemSpace,
  connector,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <SpaceDataSourceViewContentList
      owner={owner}
      space={space}
      plan={plan}
      canWriteInSpace={canWriteInSpace}
      canReadInSpace={canReadInSpace}
      parentId={parentId}
      dataSourceView={dataSourceView}
      onSelect={(parentId) => {
        void router.push(
          `/w/${owner.sId}/spaces/${dataSourceView.spaceId}/categories/${category}/data_source_views/${dataSourceView.sId}?parentId=${parentId}`
        );
      }}
      isAdmin={isAdmin}
      systemSpace={systemSpace}
      connector={connector}
    />
  );
}

Space.getLayout = (
  page: ReactElement,
  pageProps: InferGetServerSidePropsType<typeof getServerSideProps>
) => {
  return (
    <AppHeadLayout>
      <SpaceLayout pageProps={pageProps} useBackendSearch>
        {page}
      </SpaceLayout>
    </AppHeadLayout>
  );
};
