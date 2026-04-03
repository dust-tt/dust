import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import { useTextAsCronRule } from "@app/lib/swr/agent_triggers";
import { describeScheduleConfig } from "@app/lib/utils/schedule_description";
import { getNextOccurrences } from "@app/lib/utils/schedule_next_occurrences";
import type { ScheduleConfig } from "@app/types/assistant/triggers";
import { isCronScheduleConfig } from "@app/types/assistant/triggers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AnimatedText,
  ArrowRightIcon,
  ContentMessage,
  ContentMessageInline,
  DotIcon,
  Icon,
  InformationCircleIcon,
  Label,
  TextArea,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";
import { useMemo, useState } from "react";

import { useController, useFormContext } from "react-hook-form";

const NEXT_OCCURRENCES_COUNT = 5;
const MIN_DESCRIPTION_LENGTH = 10;

function formatTimezone(timezone: string): string {
  const parts = timezone.split("/");
  if (parts.length < 2) {
    return timezone;
  }
  const city = parts[parts.length - 1].replace(/_/g, " ");
  return `${city} (${timezone})`;
}

function isErrorWithMessage(
  err: unknown
): err is { error: { message: string } } {
  return (
    typeof err === "object" &&
    err !== null &&
    "error" in err &&
    typeof err.error === "object" &&
    err.error !== null &&
    "message" in err.error &&
    typeof err.error.message === "string"
  );
}

function extractErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.error.message;
  }
  return "Unable to generate a schedule. Please try rephrasing.";
}

interface ScheduleEditionSchedulerProps {
  isEditor: boolean;
  owner: LightWorkspaceType;
}

export function ScheduleEditionScheduler({
  isEditor,
  owner,
}: ScheduleEditionSchedulerProps) {
  const { control, setValue, getFieldState, formState } =
    useFormContext<TriggerViewsSheetFormValues>();

  const {
    field: {
      value: naturalLanguageDescription,
      onChange: onNaturalDescriptionChange,
    },
  } = useController({ control, name: "schedule.naturalLanguageDescription" });

  const {
    field: { value: cron, onChange: onCronChange },
  } = useController({ control, name: "schedule.cron" });
  const {
    field: { value: scheduleType, onChange: onScheduleTypeChange },
  } = useController({ control, name: "schedule.scheduleType" });
  const { error: cronError } = getFieldState("schedule.cron", formState);
  const { error: timezoneError } = getFieldState(
    "schedule.timezone",
    formState
  );

  const [generationStatus, setGenerationStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [cronErrorMessage, setCronErrorMessage] = useState<string | null>(null);
  const [generatedTimezone, setGeneratedTimezone] = useState<string | null>(
    null
  );
  const [generatedConfig, setGeneratedConfig] = useState<ScheduleConfig | null>(
    null
  );

  const textAsCronRule = useTextAsCronRule({ workspace: owner });

  const triggerCronGeneration = useDebounceWithAbort(
    async (txt: string, signal: AbortSignal) => {
      if (txt.length < MIN_DESCRIPTION_LENGTH) {
        return;
      }

      onCronChange("");
      onScheduleTypeChange("cron");
      const result = await textAsCronRule(txt, signal);

      // If the request was not aborted, we can update the form.
      if (!signal.aborted) {
        if (result.isOk()) {
          const config = result.value;
          setGeneratedConfig(config);

          if (isCronScheduleConfig(config)) {
            onScheduleTypeChange("cron");
            onCronChange(config.cron);
            setValue("schedule.timezone", config.timezone);
          } else {
            onScheduleTypeChange("interval");
            setValue("schedule.intervalDays", config.intervalDays);
            setValue("schedule.dayOfWeek", config.dayOfWeek);
            setValue("schedule.hour", config.hour);
            setValue("schedule.minute", config.minute);
            setValue("schedule.timezone", config.timezone);
          }
          setGeneratedTimezone(config.timezone);
          setGenerationStatus("idle");
        } else {
          setGenerationStatus("error");
          setCronErrorMessage(extractErrorMessage(result.error));
          setGeneratedTimezone(null);
          setGeneratedConfig(null);
        }
      }
    },
    { delayMs: 500 }
  );

  const {
    field: { value: timezone },
  } = useController({ control, name: "schedule.timezone" });

  // Resolved schedule config, shared between description and next occurrences.
  const resolvedConfig = useMemo((): ScheduleConfig | null => {
    if (generationStatus !== "idle") {
      return null;
    }
    const hasSchedule =
      scheduleType === "interval" ? !!generatedConfig : !!cron;
    if (!hasSchedule) {
      return null;
    }
    return generatedConfig ?? { cron, timezone };
  }, [generationStatus, scheduleType, generatedConfig, cron, timezone]);

  const cronDescription = useMemo(() => {
    switch (generationStatus) {
      case "loading":
        return "Generating schedule...";
      case "error":
        return cronErrorMessage;
      case "idle": {
        if (!resolvedConfig) {
          return undefined;
        }
        const desc = describeScheduleConfig(resolvedConfig);
        if (generatedTimezone) {
          return `${desc}, in ${formatTimezone(generatedTimezone)} timezone.`;
        }
        return desc;
      }
      default:
        assertNever(generationStatus);
    }
  }, [generationStatus, resolvedConfig, generatedTimezone, cronErrorMessage]);

  const nextOccurrences = useMemo(() => {
    if (!resolvedConfig) {
      return [];
    }
    return getNextOccurrences(resolvedConfig, NEXT_OCCURRENCES_COUNT);
  }, [resolvedConfig]);

  const handleNaturalDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const txt = e.target.value;
    onNaturalDescriptionChange(txt);
    setGenerationStatus(txt ? "loading" : "idle");

    triggerCronGeneration(txt);
  };

  return (
    <div className="space-y-1">
      <Label htmlFor="schedule-description">Scheduler</Label>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Describe when you want the agent to run in natural language.
      </p>
      <TextArea
        id="schedule-description"
        placeholder='e.g. "run every day at 9 AM", or "Late afternoon on business days"...'
        rows={3}
        value={naturalLanguageDescription}
        disabled={!isEditor}
        onChange={handleNaturalDescriptionChange}
      />

      {cronDescription && (
        <div className="my-2">
          <ContentMessage variant="outline" size="lg">
            <div className="flex flex-row items-start gap-2 text-foreground dark:text-foreground-night">
              {generationStatus === "loading" ? (
                <>
                  <DotIcon className="mt-0.5 h-4 w-4 shrink-0 self-start" />
                  <AnimatedText variant="primary">
                    {cronDescription}
                  </AnimatedText>
                </>
              ) : (
                <>
                  <ArrowRightIcon className="mt-0.5 h-4 w-4 shrink-0 self-start" />
                  <div className="flex flex-1 items-center justify-between">
                    <p>{cronDescription}</p>
                    {nextOccurrences.length > 0 && (
                      <Tooltip
                        label={
                          <div className="flex flex-col gap-0.5 text-xs">
                            <span className="font-semibold">
                              Next 5 occurrences
                            </span>
                            {nextOccurrences.map((date, index) => (
                              <span key={index}>
                                {date.toLocaleDateString("en-US", {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            ))}
                          </div>
                        }
                        trigger={
                          <Icon
                            visual={InformationCircleIcon}
                            size="xs"
                            className="shrink-0 text-faint dark:text-faint-night"
                          />
                        }
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </ContentMessage>
        </div>
      )}

      {(cronError !== undefined || timezoneError !== undefined) && (
        <ContentMessageInline variant="warning">
          {cronError?.message ?? timezoneError?.message}
        </ContentMessageInline>
      )}
    </div>
  );
}
