import type {
  DataSourceViewType,
  PlanType,
  SpaceType,
  SubscriptionType,
  TrackerConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import { TrackerBuilder } from "@app/components/trackers/TrackerBuilder";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  baseUrl: string;
  isAdmin: boolean;
  owner: WorkspaceType;
  plan: PlanType;
  subscription: SubscriptionType;
  globalSpace: SpaceType;
  dataSourceViews: DataSourceViewType[];
  trackerToEdit: TrackerConfigurationType;
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

  const tracker = await TrackerConfigurationResource.fetchById(auth, trackerId);
  if (!tracker) {
    return {
      notFound: true,
    };
  }

  const dataSourceViews = await DataSourceViewResource.listBySpaces(auth, [
    globalSpace,
  ]);

  return {
    props: {
      baseUrl: config.getClientFacingUrl(),
      dataSourceViews: dataSourceViews.map((v) => v.toJSON()),
      isAdmin: auth.isAdmin(),
      owner,
      plan,
      subscription,
      globalSpace: globalSpace.toJSON(),
      trackerToEdit: tracker.toJSON(),
    },
  };
});

export default function DocumentTracker({
  owner,
  subscription,
  globalSpace,
  dataSourceViews,
  trackerToEdit,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <TrackerBuilder
      owner={owner}
      subscription={subscription}
      globalSpace={globalSpace}
      dataSourceViews={dataSourceViews}
      trackerToEdit={trackerToEdit}
    />
  );
}
