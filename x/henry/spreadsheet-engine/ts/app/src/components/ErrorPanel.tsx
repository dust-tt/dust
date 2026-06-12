// Typed engine errors -> user-facing states, following the README's
// "Errors and recovery" table. POISONED is terminal for the client: the
// action destroys the worker and spawns a fresh one (useEngineClient.reset).

import { ArrowPathIcon, Button, ContentMessage, ExclamationCircleIcon, LockIcon } from "@dust-tt/sparkle";

import type { EngineErrorException } from "@dust/sheet-engine-client";

interface ErrorPanelProps {
  error: EngineErrorException;
  onResetViewer: () => void;
}

function describe(error: EngineErrorException): { title: string; body: string } {
  switch (error.code) {
    case "UNSUPPORTED_FORMAT":
      return {
        title: "Unsupported format",
        body: `This file is not an .xlsx or CSV workbook (${error.detail}). Convert it to .xlsx and try again.`,
      };
    case "ENCRYPTED":
      return {
        title: "Password protected",
        body: "This workbook is encrypted. Open it in Excel, remove the password, and try again.",
      };
    case "CORRUPT":
      return {
        title: "File can't be previewed",
        body: "The file looks damaged or is not a real workbook. The engine rejected it safely.",
      };
    case "BUDGET_EXCEEDED":
      return {
        title: "Too large to preview",
        body: `A safety budget stopped this file (${error.detail}). That includes decompression bombs: they are rejected, not inflated.`,
      };
    case "CANCELLED":
      return { title: "Cancelled", body: "The open was cancelled." };
    case "POISONED":
      return {
        title: "Engine crashed and was contained",
        body: "The WASM instance trapped. The worker is quarantined; nothing else in this tab is affected. Reload the viewer to spawn a fresh engine.",
      };
    case "INTERNAL":
      return { title: "Engine error", body: error.detail || "Unexpected engine error." };
    default: {
      // Compile-time exhaustiveness: a new EngineErrorCode fails here.
      const exhaustive: never = error.code;
      return { title: "Engine error", body: String(exhaustive) };
    }
  }
}

export function ErrorPanel({ error, onResetViewer }: ErrorPanelProps) {
  const { title, body } = describe(error);
  const isPoisoned = error.code === "POISONED";
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md">
        <ContentMessage
          title={title}
          variant={isPoisoned ? "warning" : "info"}
          icon={error.code === "ENCRYPTED" ? LockIcon : ExclamationCircleIcon}
        >
          <div className="flex flex-col gap-3">
            <p>{body}</p>
            <p className="font-mono text-xs text-slate-500">
              {error.code}
              {error.detail ? `: ${error.detail}` : ""}
            </p>
            {isPoisoned && (
              <div>
                <Button
                  variant="warning"
                  size="sm"
                  icon={ArrowPathIcon}
                  label="Reload viewer"
                  onClick={onResetViewer}
                />
              </div>
            )}
          </div>
        </ContentMessage>
      </div>
    </div>
  );
}
