import type { InferGetServerSidePropsType } from "next";

import { TrackerBuilder } from "@app/components/trackers/TrackerBuilder";
import config from "@app/lib/api/config";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  DataSourceViewType,
  PlanType,
  SpaceType,
  SubscriptionType,
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
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  if (!owner || !plan || !subscription || !auth.isUser() || !globalSpace) {
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
    },
  };
});

export default function DocumentTracker({
  owner,
  subscription,
  globalSpace,
  dataSourceViews,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <TrackerBuilder
      owner={owner}
      subscription={subscription}
      globalSpace={globalSpace}
      dataSourceViews={dataSourceViews}
      initialTrackerState={null}
      initialTrackerId={null}
    />
  );
}
