import { FirstSyncTaskLookbackForm } from "@app/components/assistant/conversation/space/FirstSyncTaskLookbackForm";
import { ConfirmContext } from "@app/components/Confirm";
import { PodSettingsOptionLabel } from "@app/components/pod/settings/PodSettingsOptionLabel";
import type { InitialTasksSyncLookbackValue } from "@app/lib/project_task/analyze_document/types";
import { useUpdatePodMetadata } from "@app/lib/swr/pods";
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

const SUGGEST_TASKS_TOOLTIP =
  "When this is on, Dust periodically reviews this Pod's conversations and connected sources and adds suggested tasks. Turn it off if you only want tasks you create yourself.";

const SUGGEST_TASKS_TOOLTIP_NON_EDITOR = `${SUGGEST_TASKS_TOOLTIP} Only Pod editors can change this.`;

const LAST_SCAN_NEVER_TOOLTIP =
  "Dust has not run an automatic scan for task suggestions for this Pod yet.";

function lastScanTooltip(lastTodoAnalysisAt: number | null): string {
  if (lastTodoAnalysisAt == null) {
    return LAST_SCAN_NEVER_TOOLTIP;
  }
  const relative = timeAgoFrom(lastTodoAnalysisAt, { useLongFormat: true });
  return `Last automatic scan for new task suggestions: ${relative} ago.`;
}

interface SuggestedTasksGenerationTileProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
}

export function SuggestedTasksGenerationTile({
  owner,
  pod,
}: SuggestedTasksGenerationTileProps) {
  const confirm = useContext(ConfirmContext);
  const updatePodMetadata = useUpdatePodMetadata({
    owner,
    podId: pod.sId,
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

  const isPodArchived = !!pod.archivedAt;
  const structurallyDisabled = !pod.isMember || isPodArchived || !pod.isEditor;
  const sliderDisabled = structurallyDisabled || isUpdatingTodoGeneration;

  const toggleTooltip = isPodArchived
    ? "This Pod is archived; suggestion settings cannot be changed."
    : !pod.isEditor && pod.isMember
      ? SUGGEST_TASKS_TOOLTIP_NON_EDITOR
      : SUGGEST_TASKS_TOOLTIP;

  const handleTodoGenerationToggle = useCallback(async () => {
    if (structurallyDisabled) {
      return;
    }
    if (pod.todoGenerationEnabled) {
      setIsUpdatingTodoGeneration(true);
      try {
        await updatePodMetadata({
          todoGenerationEnabled: false,
        });
      } finally {
        setIsUpdatingTodoGeneration(false);
      }
      return;
    }

    if (pod.lastTodoAnalysisAt === null) {
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
        await updatePodMetadata({
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
      await updatePodMetadata({
        todoGenerationEnabled: true,
      });
    } finally {
      setIsUpdatingTodoGeneration(false);
    }
  }, [
    confirm,
    onFirstSyncLookbackChange,
    structurallyDisabled,
    pod.lastTodoAnalysisAt,
    pod.todoGenerationEnabled,
    updatePodMetadata,
  ]);

  const onToggleClick = structurallyDisabled
    ? () => {}
    : handleTodoGenerationToggle;

  return (
    <div className="flex items-center justify-between gap-4">
      <PodSettingsOptionLabel
        icon={SparklesIcon}
        title="Suggest tasks"
        description="Automatic task suggestions from Pod activity"
        trailingInTitle={
          <Chip color="golden" label="Experimental" size="mini" />
        }
      />
      <div className="flex shrink-0 items-center gap-2">
        <Tooltip
          label={lastScanTooltip(pod.lastTodoAnalysisAt)}
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
                selected={pod.todoGenerationEnabled}
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
