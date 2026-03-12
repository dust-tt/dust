import {
  useDigestGenerationStatus,
  useGenerateUserProjectDigest,
  useUserProjectDigests,
} from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  Chip,
  IconButton,
  Markdown,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

const COLLAPSED_MAX_HEIGHT_PX = 200;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const ACTIVE_THRESHOLD_MS = 6 * 60 * 60 * 1000;
const UNREAD_THRESHOLD = 5;

interface SpaceUserProjectDigestProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  hasConversations: boolean;
  unreadCount: number;
}

export function SpaceUserProjectDigest({
  owner,
  space,
  hasConversations,
  unreadCount,
}: SpaceUserProjectDigestProps) {
  const [generationError, setGenerationError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const { digests, isDigestsLoading, mutateDigests } = useUserProjectDigests({
    workspaceId: owner.sId,
    spaceId: space.sId,
    limit: 10,
  });

  const doGenerate = useGenerateUserProjectDigest({
    owner,
    spaceId: space.sId,
  });

  const { generationStatus, mutateGenerationStatus } =
    useDigestGenerationStatus({
      workspaceId: owner.sId,
      spaceId: space.sId,
    });

  const isGenerating = generationStatus === "running";

  // Track previous status to detect transitions away from "running".
  const prevStatusRef = useRef(generationStatus);
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = generationStatus;

    if (prevStatus !== "running") {
      return;
    }

    if (generationStatus === "completed" || generationStatus === "not_found") {
      void mutateDigests();
    } else if (generationStatus === "failed") {
      setGenerationError(true);
    }
  }, [generationStatus, mutateDigests]);

  // Reset to latest digest when the list changes (e.g., after generation).
  const prevDigestsLengthRef = useRef(digests.length);
  if (prevDigestsLengthRef.current !== digests.length) {
    prevDigestsLengthRef.current = digests.length;
    setCurrentIndex(0);
    setIsExpanded(false);
  }

  const handleGenerate = async () => {
    setGenerationError(false);
    const result = await doGenerate();
    if (result) {
      // Re-fetch status so SWR picks up the new "running" workflow and starts polling.
      void mutateGenerationStatus();
    }
  };

  // Auto-trigger digest generation when the digest is stale.
  const hasAutoTriggeredRef = useRef(false);
  const handleGenerateRef = useRef(handleGenerate);
  handleGenerateRef.current = handleGenerate;

  useEffect(() => {
    if (
      isDigestsLoading ||
      isGenerating ||
      hasAutoTriggeredRef.current ||
      !hasConversations
    ) {
      return;
    }

    const latestDigest = digests[0];
    const hasNoDigest = !latestDigest;
    const ageMs = latestDigest ? Date.now() - latestDigest.createdAt : 0;
    const isStale = latestDigest && ageMs > STALE_THRESHOLD_MS;
    const isActiveAndUnread =
      latestDigest &&
      ageMs > ACTIVE_THRESHOLD_MS &&
      unreadCount >= UNREAD_THRESHOLD;

    if (hasNoDigest || isStale || isActiveAndUnread) {
      hasAutoTriggeredRef.current = true;
      void handleGenerateRef.current();
    }
  }, [isDigestsLoading, isGenerating, digests, hasConversations, unreadCount]);

  if (!hasConversations) {
    return null;
  }

  if (isDigestsLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner size="sm" variant="color" />
      </div>
    );
  }

  const safeIndex = Math.min(currentIndex, Math.max(digests.length - 1, 0));
  const currentDigest = digests[safeIndex];
  const hasPrevious = safeIndex < digests.length - 1;
  const hasNext = safeIndex > 0;

  const formattedDate = currentDigest
    ? new Date(currentDigest.updatedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const isLongContent = currentDigest
    ? currentDigest.digest.split("\n").length > 5
    : false;

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex flex-wrap items-center gap-2">
        <h3 className="heading-2xl text-foreground dark:text-foreground-night">
          What's new?
        </h3>
        {currentDigest && (
          <Tooltip
            label={`Generated on ${formattedDate}`}
            trigger={
              <Chip
                size="xs"
                color={isGenerating ? "highlight" : "primary"}
                label={isGenerating ? "Updating" : formattedDate}
                isBusy={isGenerating}
              />
            }
          />
        )}
        {isGenerating && !currentDigest && (
          <Chip size="xs" color="highlight" label="Generating" isBusy />
        )}
        <div className="flex-1" />
        <Button
          size="xs"
          variant="outline"
          label="Generate"
          onClick={handleGenerate}
          disabled={isGenerating}
        />
        {digests.length > 1 && (
          <>
            <IconButton
              icon={ChevronLeftIcon}
              size="xs"
              variant="ghost"
              disabled={!hasPrevious}
              onClick={() => {
                setCurrentIndex(safeIndex + 1);
                setIsExpanded(false);
              }}
              tooltip="Older"
            />
            <IconButton
              icon={ChevronRightIcon}
              size="xs"
              variant="ghost"
              disabled={!hasNext}
              onClick={() => {
                setCurrentIndex(safeIndex - 1);
                setIsExpanded(false);
              }}
              tooltip="Newer"
            />
          </>
        )}
      </div>

      {generationError && (
        <div className="text-sm text-warning-500 dark:text-warning-500-night">
          Digest generation failed. Click Generate to retry.
        </div>
      )}

      {currentDigest ? (
        <>
          <div className="relative">
            <div
              className="flex flex-col gap-4"
              style={{
                maxHeight: isExpanded ? 2000 : COLLAPSED_MAX_HEIGHT_PX,
                overflow: "hidden",
                transition: "max-height 200ms ease",
              }}
            >
              <Markdown content={currentDigest.digest} />
            </div>
            {!isExpanded && isLongContent && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-background dark:to-background-night" />
            )}
          </div>
          {isLongContent && (
            <div>
              <Button
                size="xs"
                variant="outline"
                label={isExpanded ? "Show less" : "Show more"}
                onClick={() => setIsExpanded((prev) => !prev)}
              />
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-3 py-4">
          <Spinner size="sm" variant="color" />
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Generating your personalized digest...
          </span>
        </div>
      )}
    </div>
  );
}
