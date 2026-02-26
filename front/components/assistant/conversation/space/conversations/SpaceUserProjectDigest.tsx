import {
  useDigestGenerationStatus,
  useGenerateUserProjectDigest,
  useUserProjectDigests,
} from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  BookOpenIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  IconButton,
  Markdown,
  Page,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useEffect, useRef, useState } from "react";

interface SpaceUserProjectDigestProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  hasConversations: boolean;
}

export function SpaceUserProjectDigest({
  owner,
  space,
  hasConversations,
}: SpaceUserProjectDigestProps) {
  const [generationError, setGenerationError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

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
  }

  const handleGenerate = async () => {
    setGenerationError(false);
    const result = await doGenerate();
    if (result) {
      // Re-fetch status so SWR picks up the new "running" workflow and starts polling.
      void mutateGenerationStatus();
    }
  };

  if (!hasConversations) {
    return (
      <Page.Vertical gap="none" align="stretch">
        <ContentMessage
          variant="outline"
          size="lg"
          title="Project Digest"
          icon={BookOpenIcon}
        >
          <div className="text-element-700 text-sm">
            A summary of project activity will be available here once
            conversations start.
          </div>
        </ContentMessage>
      </Page.Vertical>
    );
  }

  if (isDigestsLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner size="sm" variant="color" />
      </div>
    );
  }

  if (isGenerating) {
    return (
      <Page.Vertical gap="none" align="stretch">
        <ContentMessage
          variant="outline"
          size="lg"
          title="Project Digest"
          icon={BookOpenIcon}
        >
          <div className="flex items-center gap-3 py-2">
            <Spinner size="sm" variant="color" />
            <span className="text-element-700 text-sm">
              Generating your personalized digest...
            </span>
          </div>
        </ContentMessage>
      </Page.Vertical>
    );
  }

  if (generationError) {
    return (
      <Page.Vertical gap="none" align="stretch">
        <ContentMessage
          variant="outline"
          size="lg"
          title="Project Digest"
          icon={BookOpenIcon}
          action={
            <Button
              label="Retry"
              variant="primary"
              size="sm"
              onClick={handleGenerate}
            />
          }
        >
          <div className="text-element-700 text-sm">
            Digest generation failed. Please try again.
          </div>
        </ContentMessage>
      </Page.Vertical>
    );
  }

  if (digests.length === 0) {
    return (
      <Page.Vertical gap="none" align="stretch">
        <ContentMessage
          variant="outline"
          size="lg"
          title="Project Digest"
          icon={BookOpenIcon}
          action={
            <Button
              label="Generate"
              variant="primary"
              size="sm"
              onClick={handleGenerate}
            />
          }
        >
          <div className="text-element-700 text-sm">
            No project digest yet. Click Generate to create an AI summary of
            recent project activity.
          </div>
        </ContentMessage>
      </Page.Vertical>
    );
  }

  const safeIndex = Math.min(currentIndex, digests.length - 1);
  const currentDigest = digests[safeIndex];

  const formattedDate = new Date(currentDigest.updatedAt).toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );

  // Extract preview content (first 3 lines).
  const lines = currentDigest.digest.split("\n");
  const previewLines = lines.slice(0, 3);
  const previewContent = previewLines.join("\n");
  const remainingContent = lines.slice(3).join("\n");
  const isLongContent = lines.length > 3;

  const hasPrevious = safeIndex < digests.length - 1;
  const hasNext = safeIndex > 0;

  return (
    <Page.Vertical gap="none" align="stretch">
      <ContentMessage
        variant="outline"
        size="lg"
        title="Project Digest"
        icon={BookOpenIcon}
        className="[&>div>div]:!w-full"
      >
        <div className="flex flex-col py-2">
          {isLongContent ? (
            <Collapsible key={currentDigest.sId}>
              <div>
                <Markdown content={previewContent} />
                <CollapsibleTrigger
                  label="Show more"
                  variant="secondary"
                  className="mt-2"
                />
              </div>
              <CollapsibleContent className="mt-2">
                <Markdown content={remainingContent} />
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <Markdown content={currentDigest.digest} />
          )}

          <div className="mt-3 flex items-center border-t border-border pt-2 dark:border-border-night">
            <Tooltip
              trigger={
                <span className="text-xs text-muted-foreground">
                  {formattedDate}
                </span>
              }
              label="Generated by the AI butler of this project"
              tooltipTriggerAsChild={false}
            />
            <div className="ml-auto flex items-center gap-1">
              <Button
                label="Generate"
                variant="ghost"
                size="xs"
                onClick={handleGenerate}
              />
              {digests.length > 1 && (
                <>
                  <IconButton
                    icon={ChevronLeftIcon}
                    size="xs"
                    variant="ghost"
                    disabled={!hasPrevious}
                    onClick={() => setCurrentIndex(safeIndex + 1)}
                    tooltip="Older"
                  />
                  <IconButton
                    icon={ChevronRightIcon}
                    size="xs"
                    variant="ghost"
                    disabled={!hasNext}
                    onClick={() => setCurrentIndex(safeIndex - 1)}
                    tooltip="Newer"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </ContentMessage>
    </Page.Vertical>
  );
}
