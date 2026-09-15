import { PluginForm } from "@app/components/poke/plugins/PluginForm";
import {
  PokeAlert,
  PokeAlertDescription,
  PokeAlertTitle,
} from "@app/components/poke/shadcn/ui/alert";
import type { PluginListItem, PluginResponse } from "@app/lib/api/poke/types";
import { getCellDisplay } from "@app/lib/poke/cells";
import {
  usePokePluginAsyncArgs,
  usePokePluginManifest,
  useRunPokePlugin,
} from "@app/poke/swr/plugins";
import type { CellInfo, CellType } from "@app/types/cell";
import type { PluginResourceTarget } from "@app/types/poke/plugins";
import {
  Button,
  CheckboxWithText,
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

interface CellRunResult {
  cell: CellInfo;
  ok: boolean;
  message: string;
}

interface CellRunResultsProps {
  results: CellRunResult[];
}

function CellRunResults({ results }: CellRunResultsProps) {
  const succeeded = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);

  return (
    <div className="mb-4 mt-4 flex flex-col gap-2">
      {succeeded.length > 0 && (
        <PokeAlert variant="success">
          <PokeAlertTitle>Succeeded</PokeAlertTitle>
          <PokeAlertDescription>
            {succeeded
              .map(
                (result) => `${getCellDisplay(result.cell)}: ${result.message}`
              )
              .join(" · ")}
          </PokeAlertDescription>
        </PokeAlert>
      )}
      {failed.length > 0 && (
        <PokeAlert variant="destructive">
          <PokeAlertTitle>Failed</PokeAlertTitle>
          <PokeAlertDescription>
            {failed
              .map(
                (result) => `${getCellDisplay(result.cell)}: ${result.message}`
              )
              .join(" · ")}
          </PokeAlertDescription>
        </PokeAlert>
      )}
    </div>
  );
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
  // When set, the plugin runs once per selected cell
  cellSelection?: {
    cells: CellInfo[];
    initiallySelected?: CellType[];
  };
};

export function RunPluginDialog({
  initialValues,
  onClose,
  plugin,
  pluginResourceTarget,
  cellSelection,
}: ExecutePluginDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PluginResponse | null>(null);
  const [cellResults, setCellResults] = useState<CellRunResult[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedCells, setSelectedCells] = useState<Set<CellType>>(
    () =>
      new Set(
        cellSelection?.initiallySelected ??
          cellSelection?.cells.map((cell) => cell.name)
      )
  );

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

  const { doRunPlugin, doRunPluginOnCells } = useRunPokePlugin({
    pluginId: plugin.id,
    pluginResourceTarget,
  });

  const [isCopied, copyToClipboard] = useCopyToClipboard();

  // Inputs and cell choices are frozen while running or after a fully
  // successful run; a run with failures stays editable so it can be retried.
  const hasCellFailures =
    cellResults?.some((cellResult) => !cellResult.ok) ?? false;
  const isLocked =
    isRunning || result !== null || (cellResults !== null && !hasCellFailures);

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
    setCellResults(null);
    setElapsedSeconds(0);
    onClose();
  };

  const onSubmit = useCallback(
    async (args: object) => {
      setError(null);
      setResult(null);
      setCellResults(null);
      setIsRunning(true);

      try {
        if (cellSelection) {
          const targetCells = cellSelection.cells.filter((cell) =>
            selectedCells.has(cell.name)
          );
          if (targetCells.length === 0) {
            setError("Select at least one cell to run this plugin on.");
            return;
          }
          const results = await doRunPluginOnCells(args, targetCells);
          const mappedResults = results.map(({ cell, result }) =>
            result.isOk()
              ? {
                  cell,
                  ok: true,
                  message: pluginResponseToCopyText(result.value),
                }
              : { cell, ok: false, message: result.error }
          );
          setCellResults(mappedResults);

          // Narrow the selection to only the failed cells so a retry
          // doesn't re-run the plugin against cells that already succeeded.
          const failedCells = mappedResults.filter((r) => !r.ok);
          if (failedCells.length > 0) {
            setSelectedCells(new Set(failedCells.map((r) => r.cell.name)));
          }
        } else {
          const runRes = await doRunPlugin(args);
          if (runRes.isErr()) {
            setError(runRes.error);
          } else {
            setResult(runRes.value);
          }
        }
      } finally {
        setIsRunning(false);
      }
    },
    [cellSelection, selectedCells, doRunPlugin, doRunPluginOnCells]
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
          {!cellSelection && (
            <DialogDescription className="whitespace-pre-line">
              {plugin.description}
            </DialogDescription>
          )}
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
              {cellResults && <CellRunResults results={cellResults} />}
              {cellSelection && (
                <div className="mb-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Cells:</div>
                    <Button
                      variant="ghost"
                      size="xs"
                      label={
                        selectedCells.size === cellSelection.cells.length
                          ? "Unselect All"
                          : "Select All"
                      }
                      disabled={isLocked}
                      onClick={() =>
                        setSelectedCells(
                          selectedCells.size === cellSelection.cells.length
                            ? new Set()
                            : new Set(cellSelection.cells.map((c) => c.name))
                        )
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {cellSelection.cells.map((cell) => (
                      <CheckboxWithText
                        key={cell.name}
                        id={`run-plugin-cell-${cell.name}`}
                        text={getCellDisplay(cell)}
                        checked={selectedCells.has(cell.name)}
                        disabled={isLocked}
                        onCheckedChange={(checked) => {
                          const nextSelectedCells = new Set(selectedCells);
                          if (checked === true) {
                            nextSelectedCells.add(cell.name);
                          } else {
                            nextSelectedCells.delete(cell.name);
                          }
                          setSelectedCells(nextSelectedCells);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <PluginForm
                disabled={isLocked}
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
