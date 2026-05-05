import { ProjectSettingsOptionLabel } from "@app/components/assistant/conversation/space/about/ProjectSettingsOptionLabel";
import { FirstSyncTodoLookbackForm } from "@app/components/assistant/conversation/space/FirstSyncTodoLookbackForm";
import { ConfirmContext } from "@app/components/Confirm";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { InitialTodoSyncLookbackValue } from "@app/lib/project_todo/analyze_document/types";
import { useUpdateProjectMetadata } from "@app/lib/swr/spaces";
import { timeAgoFrom } from "@app/lib/utils";
import type { RichSpaceType } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Chip,
  Icon,
  InformationCircleIcon,
  SliderToggle,
  SparklesIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { useCallback, useContext, useRef, useState } from "react";

const SUGGEST_TO_DOS_TOOLTIP =
  "When this is on, Dust periodically reviews this project’s conversations and connected sources and adds suggested to-dos. Turn it off if you only want to-dos you create yourself.";

const SUGGEST_TO_DOS_TOOLTIP_NON_EDITOR = `${SUGGEST_TO_DOS_TOOLTIP} Only project editors can change this.`;

const LAST_SCAN_NEVER_TOOLTIP =
  "Dust has not run an automatic scan for to-do suggestions for this project yet.";

function lastScanTooltip(lastTodoAnalysisAt: number | null): string {
  if (lastTodoAnalysisAt == null) {
    return LAST_SCAN_NEVER_TOOLTIP;
  }
  const relative = timeAgoFrom(lastTodoAnalysisAt, { useLongFormat: true });
  return `Last automatic scan for new to-do suggestions: ${relative} ago.`;
}

export type SuggestedTodosGenerationTileProps = {
  owner: LightWorkspaceType;
  space: RichSpaceType;
};

export function SuggestedTodosGenerationTile({
  owner,
  space,
}: SuggestedTodosGenerationTileProps) {
  const { hasFeature } = useFeatureFlags();
  const confirm = useContext(ConfirmContext);
  const updateProjectMetadata = useUpdateProjectMetadata({
    owner,
    spaceId: space.sId,
  });
  const [isUpdatingTodoGeneration, setIsUpdatingTodoGeneration] =
    useState(false);
  const firstSyncLookbackRef = useRef<InitialTodoSyncLookbackValue>("last_24h");
  const onFirstSyncLookbackChange = useCallback(
    (v: InitialTodoSyncLookbackValue) => {
      firstSyncLookbackRef.current = v;
    },
    []
  );

  const isProjectArchived = !!space.archivedAt;
  const structurallyDisabled =
    !space.isMember || isProjectArchived || !space.isEditor;
  const sliderDisabled = structurallyDisabled || isUpdatingTodoGeneration;

  const toggleTooltip = isProjectArchived
    ? "This project is archived; suggestion settings cannot be changed."
    : !space.isEditor && space.isMember
      ? SUGGEST_TO_DOS_TOOLTIP_NON_EDITOR
      : SUGGEST_TO_DOS_TOOLTIP;

  const handleTodoGenerationToggle = useCallback(async () => {
    if (structurallyDisabled) {
      return;
    }
    if (space.todoGenerationEnabled) {
      setIsUpdatingTodoGeneration(true);
      try {
        await updateProjectMetadata({
          todoGenerationEnabled: false,
        });
      } finally {
        setIsUpdatingTodoGeneration(false);
      }
      return;
    }

    if (space.lastTodoAnalysisAt === null) {
      firstSyncLookbackRef.current = "last_24h";
      const confirmed = await confirm({
        title: "Turn on suggested to-dos?",
        message: (
          <FirstSyncTodoLookbackForm
            onValueChange={onFirstSyncLookbackChange}
          />
        ),
        validateLabel: "Turn on",
        validateVariant: "primary",
        cancelLabel: "Cancel",
      });
      if (!confirmed) {
        return;
      }
      setIsUpdatingTodoGeneration(true);
      try {
        await updateProjectMetadata({
          todoGenerationEnabled: true,
          initialTodoAnalysisLookback: firstSyncLookbackRef.current,
        });
      } finally {
        setIsUpdatingTodoGeneration(false);
      }
      return;
    }

    setIsUpdatingTodoGeneration(true);
    try {
      await updateProjectMetadata({
        todoGenerationEnabled: true,
      });
    } finally {
      setIsUpdatingTodoGeneration(false);
    }
  }, [
    confirm,
    onFirstSyncLookbackChange,
    structurallyDisabled,
    space.lastTodoAnalysisAt,
    space.todoGenerationEnabled,
    updateProjectMetadata,
  ]);

  const onToggleClick = structurallyDisabled
    ? () => {}
    : handleTodoGenerationToggle;

  if (!hasFeature("project_todo")) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <ProjectSettingsOptionLabel
        icon={SparklesIcon}
        title="Suggest to-dos"
        description="Automatic to-do suggestions from project activity"
        trailingInTitle={
          <Chip color="golden" label="Experimental" size="mini" />
        }
      />
      <div className="flex shrink-0 items-center gap-2">
        <Tooltip
          label={lastScanTooltip(space.lastTodoAnalysisAt)}
          trigger={
            <button
              type="button"
              className="inline-flex rounded-md p-1 text-muted-foreground hover:text-foreground dark:text-muted-foreground-night dark:hover:text-foreground-night"
              aria-label="Last automatic to-do suggestion scan"
            >
              <Icon visual={InformationCircleIcon} size="sm" />
            </button>
          }
        />
        <Tooltip
          label={toggleTooltip}
          trigger={
            <div>
              <SliderToggle
                size="xs"
                selected={space.todoGenerationEnabled}
                disabled={sliderDisabled}
                onClick={onToggleClick}
              />
            </div>
          }
        />
      </div>
    </div>
  );
}
