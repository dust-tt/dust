import { describeScheduleConfig } from "@app/components/agent_builder/triggers/schedule/describeScheduleConfig";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatDate } from "@app/lib/i18n/format";
import { useTextAsCronRule } from "@app/lib/swr/agent_triggers";
import { getNextOccurrences } from "@app/lib/utils/schedule_next_occurrences";
import type { ScheduleConfig } from "@app/types/assistant/triggers";
import { isCronScheduleConfig } from "@app/types/assistant/triggers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AnimatedText,
  ArrowRight,
  ContentMessage,
  ContentMessageInline,
  Dot,
  Icon,
  InfoCircle,
  Label,
  TextArea,
  Tooltip,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
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

interface ScheduleEditionSchedulerProps {
  isEditor: boolean;
  owner: LightWorkspaceType;
}

export function ScheduleEditionScheduler({
  isEditor,
  owner,
}: ScheduleEditionSchedulerProps) {
  const { t } = useLingui();
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
        return t`Generating schedule...`;
      case "error":
        return t`Unable to generate a schedule. Please try rephrasing.`;
      case "idle": {
        if (!resolvedConfig) {
          return undefined;
        }
        const description = describeScheduleConfig(resolvedConfig, t);
        if (generatedTimezone) {
          const timezoneLabel = formatTimezone(generatedTimezone);
          return t`${description}, in ${timezoneLabel} timezone.`;
        }
        return description;
      }
      default:
        assertNever(generationStatus);
    }
  }, [generationStatus, resolvedConfig, generatedTimezone, t]);

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
      <Label htmlFor="schedule-description">
        <Trans>Scheduler</Trans>
      </Label>
      <p className="text-sm text-muted-foreground">
        <Trans>
          Describe when you want the agent to run in natural language.
        </Trans>
      </p>
      <TextArea
        id="schedule-description"
        placeholder={t`e.g. "run every day at 9 AM", or "Late afternoon on business days"...`}
        rows={3}
        value={naturalLanguageDescription}
        disabled={!isEditor}
        onChange={handleNaturalDescriptionChange}
      />

      {cronDescription && (
        <div className="my-2">
          <ContentMessage variant="outline" size="lg">
            <div className="flex flex-row items-start gap-2 text-foreground">
              {generationStatus === "loading" ? (
                <>
                  <Dot className="mt-0.5 h-4 w-4 shrink-0 self-start" />
                  <AnimatedText variant="primary">
                    {cronDescription}
                  </AnimatedText>
                </>
              ) : (
                <>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 self-start" />
                  <div className="flex flex-1 items-center justify-between">
                    <p>{cronDescription}</p>
                    {nextOccurrences.length > 0 && (
                      <Tooltip
                        label={
                          <div className="flex flex-col gap-0.5 text-xs">
                            <span className="font-semibold">
                              <Trans>Next 5 occurrences</Trans>
                            </span>
                            {nextOccurrences.map((date, index) => (
                              <span key={index}>
                                {formatDate(
                                  date,
                                  {
                                    weekday: "long",
                                    month: "long",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                  getActiveLocale()
                                )}
                              </span>
                            ))}
                          </div>
                        }
                        trigger={
                          <Icon
                            visual={InfoCircle}
                            size="xs"
                            className="shrink-0 text-faint"
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
