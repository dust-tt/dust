import {
  BookOpenIcon,
  Button,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  Markdown,
  Page,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import React, { useEffect, useRef, useState } from "react";

import {
  useDigestGenerationStatus,
  useGenerateUserProjectDigest,
  useUserProjectDigests,
} from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";

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

  const { latestDigest, isDigestsLoading, mutateDigests } =
    useUserProjectDigests({
      workspaceId: owner.sId,
      spaceId: space.sId,
      limit: 1,
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

  if (!latestDigest) {
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

  const formattedDate = new Date(latestDigest.updatedAt).toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );

  // Extract preview content (first 3 lines).
  const lines = latestDigest.digest.split("\n");
  const previewLines = lines.slice(0, 3);
  const previewContent = previewLines.join("\n");
  const remainingContent = lines.slice(3).join("\n");
  const isLongContent = lines.length > 3;

  return (
    <Page.Vertical gap="none" align="stretch">
      <ContentMessage
        variant="outline"
        size="lg"
        title="Project Digest"
        icon={BookOpenIcon}
        className="[&>div]:!items-start"
      >
        <div className="flex flex-col py-2 ">
          <div className="flex items-center gap-2">
            <Tooltip
              trigger={<Chip color="golden" size="xs" label={formattedDate} />}
              label="Generated by the AI butler of this project"
              tooltipTriggerAsChild={false}
            />
            <Button
              label="Generate"
              variant="ghost"
              size="sm"
              onClick={handleGenerate}
            />
          </div>

          {isLongContent ? (
            <Collapsible>
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
            <Markdown content={latestDigest.digest} />
          )}
        </div>
      </ContentMessage>
    </Page.Vertical>
  );
}
