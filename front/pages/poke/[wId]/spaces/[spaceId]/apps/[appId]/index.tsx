import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import type { InferGetServerSidePropsType } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { ViewAppTable } from "@app/components/poke/apps/view";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeLayout from "@app/components/poke/PokeLayout";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import config from "@app/lib/api/config";
import { cleanSpecificationFromCore, getSpecification } from "@app/lib/api/run";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { BaseDustProdActionRegistry } from "@app/lib/registry";
import { AppResource } from "@app/lib/resources/app_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { decodeSqids } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type {
  AppType,
  LightWorkspaceType,
  SpecificationType,
  WorkspaceType,
} from "@app/types";
import { CoreAPI } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  app: AppType;
  specification: SpecificationType;
  specificationHashes: string[] | null;
  owner: LightWorkspaceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { appId, spaceId } = context.params || {};
  if (typeof spaceId !== "string") {
    return {
      notFound: true,
    };
  }

  const { hash } = context.query;
  if (hash && typeof hash !== "string") {
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
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const specificationHashes = await coreAPI.getSpecificationHashes({
    projectId: app.dustAPIProjectId,
  });

  let specification = JSON.parse(app.savedSpecification ?? "{}");
  if (hash && hash.length > 0) {
    const specificationFromCore = await getSpecification(app.toJSON(), hash);
    if (specificationFromCore) {
      cleanSpecificationFromCore(specificationFromCore);
      specification = specificationFromCore;
    }
  }

  return {
    props: {
      app: app.toJSON(),
      specification,
      specificationHashes: specificationHashes.isOk()
        ? specificationHashes.value.hashes.reverse()
        : null,
      owner,
    },
  };
});

export default function AppPage({
  app,
  specification,
  specificationHashes,
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="flex flex-row gap-x-6">
      <ViewAppTable app={app} owner={owner} />
      <div className="mt-4 flex grow flex-col gap-y-4">
        <PluginList
          pluginResourceTarget={{
            resourceId: app.sId,
            resourceType: "apps",
            workspace: owner,
          }}
        />
        <AppSpecification
          owner={owner}
          app={app}
          specificationHashes={specificationHashes}
          specification={specification}
        />
      </div>
    </div>
  );
}

function AppSpecification({
  owner,
  app,
  specification,
  specificationHashes,
}: {
  owner: LightWorkspaceType;
  app: AppType;
  specification: SpecificationType;
  specificationHashes: string[] | null;
}) {
  const { isDark } = useTheme();
  const registryApp = Object.values(BaseDustProdActionRegistry).find(
    (a) => a.app.appId === app.sId
  );
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hash = params.get("hash");

  const submit = async () => {
    try {
      const config: Record<string, any> = {};
      for (const block of specification) {
        config[block.name] = block.config;
      }

      const r = await fetch(
        `/api/poke/workspaces/${owner.sId}/apps/${app.sId}/state`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            specification: JSON.stringify(specification),
            config: JSON.stringify(config),
          }),
        }
      );
      if (!r.ok) {
        throw new Error("Failed to update app specification.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while updating the workspace.");
    }
  };

  return (
    <div className="border-material-200 my-4 flex min-h-48 flex-col rounded-lg border bg-muted-background dark:bg-muted-background-night">
      <div className="flex justify-between gap-3 rounded-t-lg bg-primary-300 p-4 dark:bg-primary-300-night">
        <h2 className="text-md font-bold">Specification :</h2>
        <div className="flex flex-row gap-2">
          {specificationHashes ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  isSelect
                  label={`${hash && hash.length > 0 ? hash : "Current"}`}
                  variant="outline"
                  size="sm"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  label="Current"
                  onClick={() => {
                    void router.push(`${pathname}?hash=`);
                  }}
                />
                {specificationHashes.map((hash) => (
                  <DropdownMenuItem
                    label={
                      registryApp?.app?.appHash === hash
                        ? `${hash} [registry]`
                        : hash
                    }
                    key={hash}
                    onClick={() => {
                      void router.push(`${pathname}?hash=${hash}`);
                    }}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div />
          )}
          <Button
            aria-label="Restore version"
            variant="outline"
            size="sm"
            onClick={() => {
              void submit();
            }}
            label="🔥 Restore version"
          />
        </div>{" "}
      </div>
      <div className="p-4">
        <JsonViewer
          theme={isDark ? "dark" : "light"}
          value={decodeSqids(specification)}
          rootName={false}
          defaultInspectDepth={2}
        />
      </div>
    </div>
  );
}

AppPage.getLayout = (
  page: ReactElement,
  { owner, app }: { owner: WorkspaceType; app: AppType }
) => {
  return <PokeLayout title={`${owner.name} - ${app.name}`}>{page}</PokeLayout>;
};
