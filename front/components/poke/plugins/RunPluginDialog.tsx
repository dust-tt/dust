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
  Clipboard,
  ClipboardCheck,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton,
  Markdown,
  Spinner,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function formatElapsed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function pluginResponseToCopyText(result: PluginResponse): string {
  switch (result.display) {
    case "json":
      return JSON.stringify(result.value, null, 2);
    case "markdown":
    case "text":
      return result.value;
    case "textWithLink":
      return `${result.value}\n${result.linkText}: ${result.link}`;
  }
}

function PluginResultHeader({
  isCopied,
  onCopy,
}: {
  isCopied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="font-medium">Result:</div>
      <IconButton
        tooltip={isCopied ? "Copied!" : "Copy result"}
        icon={isCopied ? ClipboardCheck : Clipboard}
        size="xs"
        variant="outline"
        onClick={onCopy}
      />
    </div>
  );
}

type ExecutePluginDialogProps = {
  // Values to seed the form with, overriding the manifest defaults.
  initialValues?: Record<string, unknown>;
  onClose: () => void;
  plugin: PluginListItem;
  pluginResourceTarget: PluginResourceTarget;
};

export function RunPluginDialog({
  initialValues,
  onClose,
  plugin,
  pluginResourceTarget,
}: ExecutePluginDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PluginResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

  const [isCopied, copyToClipboard] = useCopyToClipboard();

  // Tick an elapsed timer every 5s while the plugin runs so long jobs don't
  // look stalled. Hidden until the first tick so fast plugins stay quiet.
  useEffect(() => {
    if (!isRunning) {
      return;
    }

    setElapsedSeconds(0);
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRunning]);

  const handleCopyResult = useCallback(() => {
    if (result) {
      void copyToClipboard(pluginResponseToCopyText(result));
    }
  }, [copyToClipboard, result]);

  const handleClose = () => {
    setError(null);
    setResult(null);
    setElapsedSeconds(0);
    onClose();
  };

  const onSubmit = useCallback(
    async (args: object) => {
      setError(null);
      setResult(null);
      setIsRunning(true);

      try {
        const runRes = await doRunPlugin(args);
        if (runRes.isErr()) {
          setError(runRes.error);
        } else {
          setResult(runRes.value);
        }
      } finally {
        setIsRunning(false);
      }
    },
    [doRunPlugin]
  );

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "w-auto",
          "bg-muted-background",
          "sm:min-w-[600px] sm:max-w-[1000px]",
          "overflow-visible"
        )}
      >
        <DialogHeader className="bg-structure-100 rounded-t-2xl pb-4">
          <DialogTitle>Run {plugin.name} plugin</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {plugin.description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-5 py-4 text-foreground">
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
              {isRunning && (
                <PokeAlert>
                  <div className="flex items-center gap-3">
                    <Spinner size="sm" />
                    <div>
                      <PokeAlertTitle>Running…</PokeAlertTitle>
                      <PokeAlertDescription>
                        Still working
                        {elapsedSeconds >= 5
                          ? ` · ${formatElapsed(elapsedSeconds)}`
                          : ""}
                        . Leave this dialog open until it finishes.
                      </PokeAlertDescription>
                    </div>
                  </div>
                </PokeAlert>
              )}
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
                  <PluginResultHeader
                    isCopied={isCopied}
                    onCopy={handleCopyResult}
                  />
                  <div className="max-h-[400px] overflow-auto rounded-lg bg-gray-800 p-4">
                    <pre className="copy-sm whitespace-pre-wrap break-words font-mono text-gray-200">
                      {JSON.stringify(result.value, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              {result && result.display === "markdown" && (
                <div className="mb-4 mt-4">
                  <PluginResultHeader
                    isCopied={isCopied}
                    onCopy={handleCopyResult}
                  />
                  <div className="max-h-[400px] overflow-auto rounded-lg bg-gray-800 p-4">
                    <Markdown
                      content={result.value}
                      textColor="text-slate-500"
                    />
                  </div>
                </div>
              )}
              <PluginForm
                disabled={result !== null || isRunning}
                initialValues={initialValues}
                isRunning={isRunning}
                manifest={manifest}
                asyncArgs={asyncArgs}
                onSubmit={onSubmit}
                pluginResourceTarget={pluginResourceTarget}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
