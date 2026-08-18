import { Card, Spinner } from "@dust-tt/sparkle";

interface PendingPodAppTileProps {
  name: string;
  kind: "clone" | "import";
}

/**
 * Placeholder tile for an app being created. Cloning and importing both rebuild every function on
 * the Pod's Computer, so they run long enough that the grid has to show the work in progress.
 * Sized like `PodAppTile` (the spinner box matches the `md` avatar) so tiles stay aligned.
 */
export function PendingPodAppTile({ name, kind }: PendingPodAppTileProps) {
  return (
    <Card size="md" isPulsing>
      <div className="flex min-w-0 grow flex-col items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center">
          <Spinner size="md" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate heading-base text-foreground dark:text-foreground-night">
            {name}
          </span>
          <span className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
            {kind === "clone" ? "Cloning…" : "Importing…"}
          </span>
        </div>
      </div>
    </Card>
  );
}
