import { FrameSharingRow } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingRow";
import { Section } from "@app/components/assistant/conversation/interactive_content/frame/ShareFrameSection";
import { formatDateTime, formatTimeDistance } from "@app/lib/i18n/format";
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
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useState } from "react";

const INITIAL_VIEWERS_COUNT = 5;
const VIEWERS_DESCRIPTION = msg`People who accessed this frame through an email or domain invitation.`;

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
  const { t } = useLingui();
  const viewerCount = viewers?.length ?? 0;

  return (
    <Section label={t`Viewers`} description={t(VIEWERS_DESCRIPTION)}>
      {isLoading ? (
        <div role="status" className="flex items-center gap-2 py-2">
          <div aria-hidden="true">
            <Spinner size="sm" />
          </div>
          <span className="text-sm text-muted-foreground">
            <Trans>Loading viewers…</Trans>
          </span>
        </div>
      ) : hasError || !viewers ? (
        <div role="alert" className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            <Trans>Could not load viewers.</Trans>
          </p>
          <Button label={t`Retry`} variant="outline" onClick={onRetry} />
        </div>
      ) : viewers.length === 0 ? (
        <p className="p-2 text-sm text-muted-foreground">
          <Trans>No views recorded yet.</Trans>
        </p>
      ) : (
        <>
          <ListGroup className="border-0">
            <ul aria-label={t`Recent viewers`}>
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
                  label={t`${plural(viewerCount, {
                    one: "View all # viewer",
                    other: "View all # viewers",
                  })}`}
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
    </Section>
  );
}

interface ViewersDialogContentProps {
  viewers: FileViewerType[];
}

function ViewersDialogContent({ viewers }: ViewersDialogContentProps) {
  const { t } = useLingui();
  const searchId = useId();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const matchingViewers = viewers.filter((viewer) =>
    viewer.email.toLowerCase().includes(query)
  );
  const matchingCount = matchingViewers.length;
  const viewerCount = viewers.length;

  return (
    <>
      <DialogHeader hideButton>
        <DialogTitle>
          <Trans>Viewers</Trans>
        </DialogTitle>
        <DialogDescription>{t(VIEWERS_DESCRIPTION)}</DialogDescription>
        <div className="flex flex-col gap-2 py-4">
          <Input
            name={searchId}
            id={searchId}
            label={t`Search by email`}
            placeholder={t`Search viewers…`}
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
              ? t`${plural(viewerCount, {
                  one: `${matchingCount} of # viewer`,
                  other: `${matchingCount} of # viewers`,
                })}`
              : t`${plural(viewerCount, {
                  one: "# viewer",
                  other: "# viewers",
                })}`}
          </p>
        </div>
      </DialogHeader>
      <div
        key={query}
        role="region"
        aria-label={t`Viewer list`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-highlight-300"
      >
        {matchingViewers.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            <Trans>No viewers match your search.</Trans>
          </p>
        ) : (
          <ListGroup className="border-0">
            <ul aria-label={t`All viewers`}>
              {matchingViewers.map((viewer) => (
                <li key={viewer.email}>
                  <ViewerRow viewer={viewer} />
                </li>
              ))}
            </ul>
          </ListGroup>
        )}
      </div>
      <DialogFooter
        rightButtonProps={{ label: t`Close`, variant: "outline" }}
      />
    </>
  );
}

interface ViewerRowProps {
  viewer: FileViewerType;
}

function ViewerRow({ viewer }: ViewerRowProps) {
  const lastViewedAt = new Date(viewer.lastViewedAt);
  const exactTime = formatDateTime(lastViewedAt, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const timeAgo = formatTimeDistance(lastViewedAt, new Date());

  return (
    <FrameSharingRow label={viewer.email}>
      <time dateTime={lastViewedAt.toISOString()} title={exactTime}>
        <span aria-hidden="true">
          <Trans>Last viewed {timeAgo}</Trans>
        </span>
        <span className="sr-only">
          <Trans>Last viewed {exactTime}</Trans>
        </span>
      </time>
    </FrameSharingRow>
  );
}
