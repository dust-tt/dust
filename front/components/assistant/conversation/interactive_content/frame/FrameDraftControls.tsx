import { formatDateTime } from "@app/lib/i18n/format";
import { useMakeFrameDraftLive } from "@app/lib/swr/frames";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Chip, Tooltip, UploadCloud02 } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface FrameDraftControlsProps {
  draftPublicationId: string;
  frameId: string;
  hideLabels: boolean;
  livePublishedAt: number | null;
  onMadeLive: () => Promise<unknown>;
  owner: LightWorkspaceType;
}

/** Draft state of a Frame for its editors: what is pending, and the action that makes it live. */
export function FrameDraftControls({
  draftPublicationId,
  frameId,
  hideLabels,
  livePublishedAt,
  onMadeLive,
  owner,
}: FrameDraftControlsProps) {
  const { t } = useLingui();
  const makeDraftLive = useMakeFrameDraftLive({ owner, frameId });
  const [isMakingLive, setIsMakingLive] = useState(false);
  const liveSince = livePublishedAt ? formatDateTime(livePublishedAt) : null;

  const handleMakeLive = async () => {
    trackEvent({
      area: TRACKING_AREAS.FRAMES,
      object: "draft_make_live",
      action: TRACKING_ACTIONS.CLICK,
      extra: { frame_id: frameId, draft_publication_id: draftPublicationId },
    });
    setIsMakingLive(true);
    try {
      await makeDraftLive(draftPublicationId);
      // Refreshes either way: success clears the draft; a conflict brings the newer draft in.
      await onMadeLive();
    } finally {
      setIsMakingLive(false);
    }
  };

  return (
    <>
      <Tooltip
        label={
          liveSince
            ? t`Not live yet. The share link shows the version from ${liveSince}.`
            : t`Not live yet. The share link shows the live version.`
        }
        tooltipTriggerAsChild
        trigger={
          <span className="inline-flex shrink-0 items-center">
            <Chip size="mini" label={t`Draft`} />
          </span>
        }
      />
      <Button
        label={hideLabels ? undefined : t`Make live`}
        icon={UploadCloud02}
        size="xs"
        variant="primary"
        isLoading={isMakingLive}
        disabled={isMakingLive}
        onClick={() => {
          void handleMakeLive();
        }}
        aria-label={t`Make live`}
        tooltip={t`Show these changes on the share link`}
      />
    </>
  );
}
