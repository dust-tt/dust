import { ViewAppTable } from "@app/components/poke/apps/view";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import {
  useAppRouter,
  useRequiredPathParam,
  useSearchParam,
} from "@app/lib/platform";
import { decodeSqids } from "@app/lib/utils";
import { usePokeAppDetails } from "@app/poke/swr/app_details";
import type { AppType, SpecificationType } from "@app/types/app";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";

export function AppPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - App`);

  const appId = useRequiredPathParam("appId");
  const hash = useSearchParam("hash");
  const {
    data: appDetails,
    isLoading,
    isError,
  } = usePokeAppDetails({
    owner,
    appId,
    hash,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !appDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading app details.</p>
      </div>
    );
  }

  const { app, specification, specificationHashes } = appDetails;

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
  const router = useAppRouter();
  // Use asPath (actual URL) and strip query string to get the real pathname
  const pathname = router.asPath.split("?")[0];
  const hashParam = router.query.hash;
  const hash = typeof hashParam === "string" ? hashParam : null;

  const submit = async () => {
    try {
      const config: Record<string, any> = {};
      for (const block of specification) {
        config[block.name] = block.config;
      }

      const r = await clientFetch(
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
                    label={hash}
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
