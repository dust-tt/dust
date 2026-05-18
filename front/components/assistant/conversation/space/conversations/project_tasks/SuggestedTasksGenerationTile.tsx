import { ProjectSettingsOptionLabel } from "@app/components/assistant/conversation/space/about/ProjectSettingsOptionLabel";
import { FirstSyncTaskLookbackForm } from "@app/components/assistant/conversation/space/FirstSyncTaskLookbackForm";
import { ConfirmContext } from "@app/components/Confirm";
import type { InitialTasksSyncLookbackValue } from "@app/lib/project_task/analyze_document/types";
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
  "When this is on, Dust periodically reviews this pod's conversations and connected sources and adds suggested tasks. Turn it off if you only want tasks you create yourself.";

const SUGGEST_TO_DOS_TOOLTIP_NON_EDITOR = `${SUGGEST_TO_DOS_TOOLTIP} Only pod editors can change this.`;

const LAST_SCAN_NEVER_TOOLTIP =
  "Dust has not run an automatic scan for task suggestions for this pod yet.";

function lastScanTooltip(lastTodoAnalysisAt: number | null): string {
  if (lastTodoAnalysisAt == null) {
    return LAST_SCAN_NEVER_TOOLTIP;
  }
  const relative = timeAgoFrom(lastTodoAnalysisAt, { useLongFormat: true });
  return `Last automatic scan for new task suggestions: ${relative} ago.`;
}

export type SuggestedTodosGenerationTileProps = {
  owner: LightWorkspaceType;
  space: RichSpaceType;
};

export function SuggestedTasksGenerationTile({
  owner,
  space,
}: SuggestedTodosGenerationTileProps) {
  const confirm = useContext(ConfirmContext);
  const updateProjectMetadata = useUpdateProjectMetadata({
    owner,
    spaceId: space.sId,
  });
  const [isUpdatingTodoGeneration, setIsUpdatingTodoGeneration] =
    useState(false);
  const firstSyncLookbackRef =
    useRef<InitialTasksSyncLookbackValue>("last_24h");
  const onFirstSyncLookbackChange = useCallback(
    (v: InitialTasksSyncLookbackValue) => {
      firstSyncLookbackRef.current = v;
    },
    []
  );

  const isProjectArchived = !!space.archivedAt;
  const structurallyDisabled =
    !space.isMember || isProjectArchived || !space.isEditor;
  const sliderDisabled = structurallyDisabled || isUpdatingTodoGeneration;

  const toggleTooltip = isProjectArchived
    ? "This pod is archived; suggestion settings cannot be changed."
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
        title: "Turn on suggested tasks?",
        message: (
          <FirstSyncTaskLookbackForm
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

  return (
    <div className="flex items-center justify-between gap-4">
      <ProjectSettingsOptionLabel
        icon={SparklesIcon}
        title="Suggest tasks"
        description="Automatic task suggestions from pod activity"
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
              aria-label="Last automatic task suggestion scan"
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
