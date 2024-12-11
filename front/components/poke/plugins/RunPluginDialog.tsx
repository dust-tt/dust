import { Spinner } from "@dust-tt/sparkle";
import type { PluginWorkspaceResource } from "@dust-tt/types";
import { AlertCircle } from "lucide-react";
import { useCallback, useState } from "react";

import { PluginForm } from "@app/components/poke/plugins/PluginForm";
import {
  PokeAlert,
  PokeAlertDescription,
  PokeAlertTitle,
} from "@app/components/poke/shadcn/ui/alert";
import {
  PokeDialog,
  PokeDialogContent,
} from "@app/components/poke/shadcn/ui/dialog";
import type { PluginListItem, PluginResponse } from "@app/lib/api/poke/types";
import { usePokePluginManifest, useRunPokePlugin } from "@app/poke/swr/plugins";

type ExecutePluginDialogProps = {
  onClose: () => void;
  plugin: PluginListItem;
  workspaceResource?: PluginWorkspaceResource;
};

export function RunPluginDialog({
  onClose,
  plugin,
  workspaceResource,
}: ExecutePluginDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PluginResponse | null>(null);

  const { isLoading, manifest } = usePokePluginManifest({
    disabled: !open,
    pluginId: plugin?.id,
    workspaceResource,
  });

  const { doRunPlugin } = useRunPokePlugin({
    pluginId: plugin.id,
    workspaceResource,
  });

  const handleClose = () => {
    setError(null);
    setResult(null);
    onClose();
  };

  const onSubmit = useCallback(
    async (args: object) => {
      setError(null);
      setResult(null);

      const runRes = await doRunPlugin(args);
      if (runRes.isErr()) {
        setError(runRes.error);
      } else {
        setResult(runRes.value);
      }
    },
    [doRunPlugin]
  );

  return (
    <PokeDialog open={true} onOpenChange={handleClose}>
      <PokeDialogContent className="w-auto bg-structure-50 sm:min-w-[600px] sm:max-w-[1000px]">
        <h2>Run {plugin.name} plugin</h2>
        {isLoading ? (
          <Spinner />
        ) : !manifest ? (
          <PokeAlert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <PokeAlertTitle>Error</PokeAlertTitle>
            <PokeAlertDescription>
              Plugin could not be loaded.
            </PokeAlertDescription>
          </PokeAlert>
        ) : (
          <>
            {error && (
              <PokeAlert variant="destructive">
                <PokeAlertTitle>Error</PokeAlertTitle>
                <PokeAlertDescription>{error}</PokeAlertDescription>
              </PokeAlert>
            )}
            {result && result.display === "text" && (
              <PokeAlert variant="success">
                <PokeAlertTitle>Success</PokeAlertTitle>
                <PokeAlertDescription>
                  {result.value} - Make sure to reload.
                </PokeAlertDescription>
              </PokeAlert>
            )}
            {result && result.display === "json" && (
              <div className="mb-4 mt-4">
                <div className="mb-2 font-medium">Result:</div>
                <div className="max-h-[400px] overflow-auto rounded-lg bg-slate-800 p-4">
                  <pre className="font-mono whitespace-pre-wrap break-words text-sm text-slate-200">
                    {JSON.stringify(result.value, null, 2)}
                  </pre>
                </div>
              </div>
            )}
            <PluginForm
              disabled={result !== null}
              manifest={manifest}
              onSubmit={onSubmit}
            />
            {manifest.warning && (
              <PokeAlert variant="destructive">
                <PokeAlertTitle>Warning</PokeAlertTitle>
                <PokeAlertDescription>{manifest.warning}</PokeAlertDescription>
              </PokeAlert>
            )}
          </>
        )}
      </PokeDialogContent>
    </PokeDialog>
  );
}
