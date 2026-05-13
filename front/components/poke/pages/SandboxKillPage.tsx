import { cn } from "@app/components/poke/shadcn/lib/utils";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { SandboxKillRequestResponseBody } from "@app/pages/api/poke/sandbox_kill/request";
import { usePokeSandboxKillImages } from "@app/poke/swr/sandbox_kill";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  Button,
  ExclamationCircleIcon,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

type RequestKey = string;

function keyFor(baseImage: string, version?: string): RequestKey {
  return `${baseImage}|${version ?? ""}`;
}

export function SandboxKillPage() {
  useDocumentTitle("Poke - Sandbox Kill Requester");

  const { images, isImagesLoading } = usePokeSandboxKillImages();
  const sendNotification = useSendNotification();
  const [submitting, setSubmitting] = useState<RequestKey | null>(null);

  async function submitKillRequest(
    baseImage: string,
    version: string | undefined,
    confirmMessage: string
  ): Promise<void> {
    if (submitting) {
      return;
    }
    if (!window.confirm(confirmMessage)) {
      return;
    }

    const key = keyFor(baseImage, version);
    setSubmitting(key);

    try {
      const res = await clientFetch("/api/poke/sandbox_kill/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseImage, version }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        sendNotification({
          title: "Failed to request sandbox kill",
          description: errorData.error?.message ?? "Unknown error",
          type: "error",
        });
        return;
      }

      const body: SandboxKillRequestResponseBody = await res.json();
      window.open(body.temporalLink, "_blank", "noopener,noreferrer");
      sendNotification({
        title: "Sandbox kill requested",
        description: `Workflow ${body.workflowId} started. Opened Temporal in a new tab.`,
        type: "success",
      });
    } catch (error) {
      sendNotification({
        title: "Failed to request sandbox kill",
        description: normalizeError(error).message,
        type: "error",
      });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground dark:text-foreground-night">
          <TrashIcon className="h-4 w-4 text-muted-foreground dark:text-muted-foreground-night" />
          <span>Sandbox Kill Requester</span>
        </h1>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Mark running sandboxes for immediate reaping. The reaper or the next
          bash invocation will destroy them and recreate fresh ones from the
          current image. Sandboxes whose <code>baseImage</code> /{" "}
          <code>version</code> does not match a registered image below are
          legacy rows and won't be selected.
        </p>
      </header>

      {isImagesLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : images.length === 0 ? (
        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-background p-5 text-sm text-muted-foreground dark:border-border-night dark:bg-background-night dark:text-muted-foreground-night">
          <ExclamationCircleIcon className="h-4 w-4" />
          <span>No registered sandbox images found.</span>
        </div>
      ) : (
        <section
          className={cn(
            "mt-6 rounded-2xl border border-border",
            "bg-background shadow-sm dark:border-border-night dark:bg-background-night"
          )}
        >
          {images.map(({ baseImage, version }, index) => {
            const olderKey = keyFor(baseImage, version);
            const allKey = keyFor(baseImage, undefined);
            const isOlderSubmitting = submitting === olderKey;
            const isAllSubmitting = submitting === allKey;

            return (
              <div
                key={olderKey}
                className={cn(
                  "grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                  index > 0 && "border-t border-border dark:border-border-night"
                )}
              >
                <div className="space-y-1">
                  <h2 className="text-sm font-medium text-foreground dark:text-foreground-night">
                    {baseImage}
                    <span className="text-muted-foreground dark:text-muted-foreground-night">
                      :{version}
                    </span>
                  </h2>
                  <p className="text-xs leading-5 text-muted-foreground dark:text-muted-foreground-night">
                    Current registered version.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    label="Kill older versions"
                    disabled={submitting !== null}
                    isLoading={isOlderSubmitting}
                    onClick={() =>
                      void submitKillRequest(
                        baseImage,
                        version,
                        `Request kill of all "${baseImage}" sandboxes whose version differs from "${version}"?`
                      )
                    }
                  />
                  <Button
                    variant="warning"
                    size="sm"
                    label="Kill all versions"
                    disabled={submitting !== null}
                    isLoading={isAllSubmitting}
                    onClick={() =>
                      void submitKillRequest(
                        baseImage,
                        undefined,
                        `Request kill of ALL "${baseImage}" sandboxes (every version)?`
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
