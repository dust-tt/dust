import { useProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
import { isOnboardingTodo } from "@app/components/assistant/conversation/space/conversations/project_todos/utils";
import { FirstSyncTodoLookbackForm } from "@app/components/assistant/conversation/space/FirstSyncTodoLookbackForm";
import { ConfirmContext } from "@app/components/Confirm";
import type { InitialTodoSyncLookbackValue } from "@app/lib/project_todo/analyze_document/types";
import { useUpdateProjectMetadata } from "@app/lib/swr/spaces";
import { timeAgoFrom } from "@app/lib/utils";
import type { GetSpaceResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { WorkspaceType } from "@app/types/user";
import {
  Chip,
  Icon,
  InformationCircleIcon,
  SliderToggle,
  SparklesIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { useCallback, useContext, useMemo, useRef, useState } from "react";

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
  owner: WorkspaceType;
  spaceInfo: GetSpaceResponseBody["space"];
};

export function SuggestedTodosGenerationTile({
  owner,
  spaceInfo,
}: SuggestedTodosGenerationTileProps) {
  const { todos, isTodosLoading } = useProjectTodosPanel();
  const confirm = useContext(ConfirmContext);
  const updateProjectMetadata = useUpdateProjectMetadata({
    owner,
    spaceId: spaceInfo.sId,
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

  const isProjectArchived = !!spaceInfo.archivedAt;
  const structurallyDisabled =
    !spaceInfo.isMember || isProjectArchived || !spaceInfo.isEditor;
  const sliderDisabled = structurallyDisabled || isUpdatingTodoGeneration;

  const toggleTooltip = isProjectArchived
    ? "This project is archived; suggestion settings cannot be changed."
    : !spaceInfo.isEditor && spaceInfo.isMember
      ? SUGGEST_TO_DOS_TOOLTIP_NON_EDITOR
      : SUGGEST_TO_DOS_TOOLTIP;

  const handleTodoGenerationToggle = useCallback(async () => {
    if (structurallyDisabled) {
      return;
    }
    if (spaceInfo.todoGenerationEnabled) {
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

    if (spaceInfo.lastTodoAnalysisAt === null) {
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
    spaceInfo.lastTodoAnalysisAt,
    spaceInfo.todoGenerationEnabled,
    updateProjectMetadata,
  ]);

  const onToggleClick = structurallyDisabled
    ? () => {}
    : handleTodoGenerationToggle;

  const hideWhileOnboardingTodoOpen = useMemo(
    () =>
      !isTodosLoading &&
      todos.some((t) => isOnboardingTodo(t) && t.status !== "done"),
    [isTodosLoading, todos]
  );

  if (hideWhileOnboardingTodoOpen) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <SparklesIcon
              className="h-4 w-4 shrink-0 text-foreground dark:text-foreground-night"
              aria-hidden
            />
            <span className="heading-sm text-foreground dark:text-foreground-night">
              Suggested to-dos
            </span>
            <Chip color="golden" label="Beta" size="mini" />
          </div>
          <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            Automatic to-do suggestions from project activity
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip
            label={toggleTooltip}
            trigger={
              <div>
                <SliderToggle
                  size="xs"
                  selected={spaceInfo.todoGenerationEnabled}
                  disabled={sliderDisabled}
                  onClick={onToggleClick}
                />
              </div>
            }
          />
          <Tooltip
            label={lastScanTooltip(spaceInfo.lastTodoAnalysisAt)}
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
        </div>
      </div>
    </div>
  );
}
