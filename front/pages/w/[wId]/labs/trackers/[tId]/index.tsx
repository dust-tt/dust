import type { InferGetServerSidePropsType } from "next";

import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { TrackerBuilder } from "@app/components/trackers/TrackerBuilder";
import config from "@app/lib/api/config";
import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import logger from "@app/logger/logger";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  PlanType,
  SpaceType,
  SubscriptionType,
  TrackerConfigurationStateType,
  TrackerConfigurationType,
  TrackerDataSourceConfigurationType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  baseUrl: string;
  isAdmin: boolean;
  owner: WorkspaceType;
  plan: PlanType;
  subscription: SubscriptionType;
  globalSpace: SpaceType;
  dataSourceViews: DataSourceViewType[];
  initialTrackerState: TrackerConfigurationStateType;
  initialTrackerId: string;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const trackerId = _context.params?.tId as string;

  if (
    !owner ||
    !plan ||
    !subscription ||
    !auth.isUser() ||
    !globalSpace ||
    !trackerId
  ) {
    return {
      notFound: true,
    };
  }

  const flags = await getFeatureFlags(owner);
  if (!flags.includes("labs_trackers") || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const tracker = await TrackerConfigurationResource.fetchById(auth, trackerId);
  if (!tracker) {
    return {
      notFound: true,
    };
  }

  const dataSourceViews = await DataSourceViewResource.listBySpaces(auth, [
    globalSpace,
  ]);

  const initialTrackerState = await initializeTrackerBuilderState(
    tracker.toJSON(),
    dataSourceViews
  );

  return {
    props: {
      baseUrl: config.getClientFacingUrl(),
      dataSourceViews: dataSourceViews.map((v) => v.toJSON()),
      isAdmin: auth.isAdmin(),
      owner,
      plan,
      subscription,
      globalSpace: globalSpace.toJSON(),
      initialTrackerState: initialTrackerState,
      initialTrackerId: trackerId,
    },
  };
});

export default function DocumentTracker({
  owner,
  subscription,
  globalSpace,
  dataSourceViews,
  initialTrackerState,
  initialTrackerId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <TrackerBuilder
      owner={owner}
      subscription={subscription}
      globalSpace={globalSpace}
      dataSourceViews={dataSourceViews}
      initialTrackerState={initialTrackerState}
      initialTrackerId={initialTrackerId}
    />
  );
}

const initializeTrackerBuilderState = async (
  trackerToEdit: TrackerConfigurationType,
  dataSourceViews: DataSourceViewResource[]
): Promise<TrackerConfigurationStateType> => {
  const maintainedDataSources = await renderDataSourcesConfigurations(
    trackerToEdit.sId,
    trackerToEdit.maintainedDataSources,
    dataSourceViews
  );

  const watchedDataSources = await renderDataSourcesConfigurations(
    trackerToEdit.sId,
    trackerToEdit.watchedDataSources,
    dataSourceViews
  );

  return {
    status: trackerToEdit.status,
    name: trackerToEdit.name,
    description: trackerToEdit.description,
    prompt: trackerToEdit.prompt,
    modelId: trackerToEdit.modelId,
    providerId: trackerToEdit.providerId,
    temperature: trackerToEdit.temperature,
    frequency: trackerToEdit.frequency ?? "daily",
    skipEmptyEmails: trackerToEdit.skipEmptyEmails,
    recipients: trackerToEdit.recipients?.join(",") || "",
    maintainedDataSources,
    watchedDataSources,
    nameError: null,
    descriptionError: null,
    promptError: null,
    frequencyError: null,
    recipientsError: null,
  };
};

const renderDataSourcesConfigurations = async (
  trackerId: string,
  dataSourceConfigs: TrackerDataSourceConfigurationType[],
  dataSourceViews: DataSourceViewResource[]
): Promise<DataSourceViewSelectionConfigurations> => {
  const selectedResources = dataSourceConfigs.map((ds) => ({
    dataSourceViewId: ds.dataSourceViewId,
    resources: ds.filter.parents?.in ?? null,
    isSelectAll: !ds.filter.parents,
    tagsFilter: null, // No tags filters for tracker.
  }));

  const dataSourceConfigurationsArray = await Promise.all(
    selectedResources.map(async (sr) => {
      const dataSourceView = dataSourceViews.find(
        (dsv) => dsv.sId === sr.dataSourceViewId
      );
      if (!dataSourceView) {
        throw new Error(
          `Could not find DataSourceView with id ${sr.dataSourceViewId}`
        );
      }

      const serializedDataSourceView = dataSourceView.toJSON();

      if (!dataSourceView.dataSource.connectorId || !sr.resources) {
        return {
          dataSourceView: serializedDataSourceView,
          selectedResources: [],
          excludedResources: [],
          isSelectAll: sr.isSelectAll,
          tagsFilter: sr.tagsFilter,
        };
      }

      const contentNodesRes = await getContentNodesForDataSourceView(
        dataSourceView,
        {
          internalIds: sr.resources,
          viewType: "document",
        }
      );

      if (contentNodesRes.isErr()) {
        logger.error(
          {
            trackerId: trackerId,
            dataSourceView: dataSourceView.toTraceJSON(),
            error: contentNodesRes.error,
            internalIds: sr.resources,
            workspace: {
              id: dataSourceView.workspaceId,
            },
          },
          "Tracker Builder: Error fetching content nodes for documents."
        );

        return {
          dataSourceView: serializedDataSourceView,
          selectedResources: [],
          excludedResources: [],
          isSelectAll: sr.isSelectAll,
          tagsFilter: sr.tagsFilter,
        };
      }

      return {
        dataSourceView: serializedDataSourceView,
        selectedResources: contentNodesRes.value.nodes,
        excludedResources: [],
        isSelectAll: sr.isSelectAll,
        tagsFilter: sr.tagsFilter,
      };
    })
  );

  return dataSourceConfigurationsArray.reduce(
    (acc, curr) => ({
      ...acc,
      [curr.dataSourceView.sId]: curr,
    }),
    {} as DataSourceViewSelectionConfigurations
  );
};

DocumentTracker.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
