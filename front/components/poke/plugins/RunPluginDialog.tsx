import { PluginForm } from "@app/components/poke/plugins/PluginForm";
import {
  PokeAlert,
  PokeAlertDescription,
  PokeAlertTitle,
} from "@app/components/poke/shadcn/ui/alert";
import type { PluginListItem, PluginResponse } from "@app/lib/api/poke/types";
import {
  usePokePluginAsyncArgs,
  usePokePluginManifest,
  useRunPokePlugin,
} from "@app/poke/swr/plugins";
import type { PluginResourceTarget } from "@app/types/poke/plugins";
import {
  Button,
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";
import { AlertCircle } from "lucide-react";
import { useCallback, useState } from "react";

type ExecutePluginDialogProps = {
  onClose: () => void;
  plugin: PluginListItem;
  pluginResourceTarget: PluginResourceTarget;
};

export function RunPluginDialog({
  onClose,
  plugin,
  pluginResourceTarget,
}: ExecutePluginDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<PluginResponse | null>(null);

  const { isLoading, manifest } = usePokePluginManifest({
    disabled: false,
    pluginId: plugin.id,
  });

  // Check if any args are marked as async
  const hasAsyncArgs = manifest
    ? Object.values(manifest.args).some((arg) => arg.async)
    : false;

  const { asyncArgs, isLoading: isLoadingAsyncArgs } = usePokePluginAsyncArgs({
    disabled: !manifest || !hasAsyncArgs,
    pluginId: plugin.id,
    pluginResourceTarget,
  });

  const { doRunPlugin } = useRunPokePlugin({
    pluginId: plugin.id,
    pluginResourceTarget,
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

      const runRes = await doRunPlugin(args, reason.trim() || undefined);
      if (runRes.isErr()) {
        setError(runRes.error);
      } else {
        setResult(runRes.value);
      }
    },
    [doRunPlugin, reason]
  );

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "w-auto overflow-visible",
          "bg-muted-background dark:bg-muted-background-night",
          "sm:min-w-[600px] sm:max-w-[1000px]"
        )}
      >
        <DialogHeader className="bg-structure-100 dark:bg-structure-100-night rounded-t-2xl pb-4">
          <DialogTitle>Run {plugin.name} plugin</DialogTitle>
          <DialogDescription>{plugin.description}</DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {isLoading || (hasAsyncArgs && isLoadingAsyncArgs) ? (
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
              {result && result.display === "textWithLink" && (
                <PokeAlert variant="success">
                  <PokeAlertTitle>Success</PokeAlertTitle>
                  <PokeAlertDescription>
                    <p>{result.value} - Make sure to reload.</p>
                    <Button
                      onClick={() => {
                        window.open(result.link, "_blank");
                      }}
                      label={result.linkText}
                      variant="highlight"
                      className="mt-2"
                    />
                  </PokeAlertDescription>
                </PokeAlert>
              )}
              {result && result.display === "json" && (
                <div className="mb-4 mt-4">
                  <div className="mb-2 font-medium">Result:</div>
                  <div className="max-h-[400px] overflow-auto rounded-lg bg-gray-800 p-4">
                    <pre className="copy-sm whitespace-pre-wrap break-words font-mono text-gray-200">
                      {JSON.stringify(result.value, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              {result && result.display === "markdown" && (
                <div className="mb-4 mt-4">
                  <div className="mb-2 font-medium">Result:</div>
                  <div className="max-h-[400px] overflow-auto rounded-lg bg-gray-800 p-4">
                    <Markdown
                      content={result.value}
                      textColor="text-slate-500 dark:text-foreground-night"
                    />
                  </div>
                </div>
              )}
              <div className="mb-4">
                <label
                  htmlFor="plugin-reason"
                  className="mb-1 block text-sm font-medium"
                >
                  Reason (optional)
                </label>
                <textarea
                  id="plugin-reason"
                  className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                  placeholder="Why are you running this plugin?"
                  rows={2}
                  maxLength={512}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={result !== null}
                />
              </div>
              <PluginForm
                disabled={result !== null}
                manifest={manifest}
                asyncArgs={asyncArgs}
                onSubmit={onSubmit}
              />
              {manifest.warning && (
                <PokeAlert variant="destructive">
                  <PokeAlertTitle>Warning</PokeAlertTitle>
                  <PokeAlertDescription>
                    {manifest.warning}
                  </PokeAlertDescription>
                </PokeAlert>
              )}
            </>
          )}
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
