import type { AppType, LightWorkspaceType } from "@dust-tt/types";
import { JsonViewer } from "@textea/json-viewer";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { ViewAppTable } from "@app/components/poke/apps/view";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeLayout from "@app/components/poke/PokeLayout";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { AppResource } from "@app/lib/resources/app_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

export const getServerSideProps = withSuperUserAuthRequirements<{
  app: AppType;
  owner: LightWorkspaceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { appId, spaceId } = context.params || {};
  if (typeof spaceId !== "string") {
    return {
      notFound: true,
    };
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return {
      notFound: true,
    };
  }

  const app = await AppResource.fetchById(auth, appId);
  if (!app) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      app: app.toJSON(),
      owner,
    },
  };
});

export default function AppPage({
  app,
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="flex flex-row gap-x-6">
      <ViewAppTable app={app} owner={owner} />
      <div className="mt-4 flex grow flex-col gap-y-4">
        <PluginList
          resourceType="apps"
          workspaceResource={{
            workspace: owner,
            resourceId: app.sId,
          }}
        />
        <AppSpecification app={app} />
      </div>
    </div>
  );
}

function AppSpecification({ app }: { app: AppType }) {
  const { isDark } = useTheme();
  return (
    <div className="border-material-200 flex min-h-48 flex-col rounded-lg border bg-slate-100">
      <div className="flex justify-between gap-3 rounded-t-lg bg-slate-300 p-4">
        <h2 className="text-md font-bold">Specification :</h2>
      </div>
      <div className="p-4">
        <JsonViewer
          theme={isDark ? "dark" : "light"}
          value={JSON.parse(app.savedSpecification ?? "{}")}
          rootName={false}
          defaultInspectDepth={2}
        />
      </div>
    </div>
  );
}

AppPage.getLayout = (page: ReactElement) => {
  return <PokeLayout>{page}</PokeLayout>;
};
