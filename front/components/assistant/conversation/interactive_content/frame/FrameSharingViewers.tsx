import { FrameSharingRow } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingRow";
import type { FileViewerType } from "@app/types/file_viewers";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  ListGroup,
  SearchMd,
  Spinner,
} from "@dust-tt/sparkle";
import { intlFormatDistance } from "date-fns";
import { useId, useState } from "react";

const INITIAL_VIEWERS_COUNT = 5;
const VIEWERS_DESCRIPTION =
  "People who opened this frame through an email or domain invitation.";

interface FrameSharingViewersProps {
  viewers: FileViewerType[] | undefined;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
}

/**
 * @cc [owner:flvndvd,label:product] viewer-history-survives-access-changes
 * Keep recorded viewers visible after invitations are removed or the sharing scope changes.
 */
export function FrameSharingViewers({
  viewers,
  isLoading,
  hasError,
  onRetry,
}: FrameSharingViewersProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          Viewers
        </h3>
        <p className="text-xs text-muted-foreground">{VIEWERS_DESCRIPTION}</p>
      </div>
      {isLoading ? (
        <div role="status" className="flex items-center gap-2 py-2">
          <div aria-hidden="true">
            <Spinner size="sm" />
          </div>
          <span className="text-sm text-muted-foreground">
            Loading viewers…
          </span>
        </div>
      ) : hasError || !viewers ? (
        <div role="alert" className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Could not load viewers.
          </p>
          <Button label="Retry" variant="outline" onClick={onRetry} />
        </div>
      ) : viewers.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          No views recorded yet.
        </p>
      ) : (
        <>
          <ListGroup className="border-0">
            <ul aria-label="Recent viewers">
              {viewers.slice(0, INITIAL_VIEWERS_COUNT).map((viewer) => (
                <li key={viewer.email}>
                  <ViewerRow viewer={viewer} />
                </li>
              ))}
            </ul>
          </ListGroup>
          {viewers.length > INITIAL_VIEWERS_COUNT && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  label={`View all ${viewers.length} viewers`}
                  variant="ghost"
                  className="w-fit"
                />
              </DialogTrigger>
              <DialogContent
                size="md"
                className="h-[min(40rem,90dvh)]"
                preventAutoFocusOnClose={false}
              >
                <ViewersDialogContent viewers={viewers} />
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </section>
  );
}

interface ViewersDialogContentProps {
  viewers: FileViewerType[];
}

function ViewersDialogContent({ viewers }: ViewersDialogContentProps) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const matchingViewers = viewers.filter((viewer) =>
    viewer.email.toLowerCase().includes(query)
  );

  return (
    <>
      <DialogHeader hideButton>
        <DialogTitle>Viewers</DialogTitle>
        <DialogDescription>{VIEWERS_DESCRIPTION}</DialogDescription>
        <div className="flex flex-col gap-2 py-4">
          <Input
            name={searchId}
            id={searchId}
            label="Search by email"
            placeholder="Search viewers…"
            icon={SearchMd}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <p
            role="status"
            aria-atomic="true"
            className="text-xs text-muted-foreground"
          >
            {query
              ? `${matchingViewers.length} of ${viewers.length} viewers`
              : `${viewers.length} viewers`}
          </p>
        </div>
      </DialogHeader>
      <div
        key={query}
        role="region"
        aria-label="Viewer list"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-highlight-300"
      >
        {matchingViewers.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No viewers match your search.
          </p>
        ) : (
          <ListGroup className="border-0">
            <ul aria-label="All viewers">
              {matchingViewers.map((viewer) => (
                <li key={viewer.email}>
                  <ViewerRow viewer={viewer} />
                </li>
              ))}
            </ul>
          </ListGroup>
        )}
      </div>
      <DialogFooter rightButtonProps={{ label: "Close", variant: "outline" }} />
    </>
  );
}

interface ViewerRowProps {
  viewer: FileViewerType;
}

function ViewerRow({ viewer }: ViewerRowProps) {
  const lastViewedAt = new Date(viewer.lastViewedAt);
  const exactTime = lastViewedAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <FrameSharingRow label={viewer.email}>
      <time dateTime={lastViewedAt.toISOString()} title={exactTime}>
        <span aria-hidden="true">
          Last viewed {intlFormatDistance(lastViewedAt, new Date())}
        </span>
        <span className="sr-only">Last viewed {exactTime}</span>
      </time>
    </FrameSharingRow>
  );
}
