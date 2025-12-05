import {
  AnimatedText,
  ArrowRightIcon,
  ContentMessage,
  ContentMessageInline,
  DotIcon,
  Label,
  TextArea,
} from "@dust-tt/sparkle";
import cronstrue from "cronstrue";
import React, { useMemo, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import { useTextAsCronRule } from "@app/lib/swr/agent_triggers";
import type { LightWorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

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

  const cron = useWatch({ control, name: "schedule.cron" });
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

  const textAsCronRule = useTextAsCronRule({ workspace: owner });

  const triggerCronGeneration = useDebounceWithAbort(
    async (txt: string, signal: AbortSignal) => {
      if (txt.length < MIN_DESCRIPTION_LENGTH) {
        return;
      }

      setValue("schedule.cron", "");
      const result = await textAsCronRule(txt, signal);

      // If the request was not aborted, we can update the form
      if (!signal.aborted) {
        if (result.isOk()) {
          setValue("schedule.cron", result.value.cron);
          setValue("schedule.timezone", result.value.timezone);
          setGeneratedTimezone(result.value.timezone);
          setGenerationStatus("idle");
        } else {
          setGenerationStatus("error");
          setCronErrorMessage(extractErrorMessage(result.error));
          setGeneratedTimezone(null);
        }
      }
    },
    { delayMs: 500 }
  );

  const cronDescription = useMemo(() => {
    switch (generationStatus) {
      case "loading":
        return "Generating schedule...";
      case "error":
        return cronErrorMessage;
      case "idle":
        if (!cron) {
          return undefined;
        }
        try {
          const cronDesc = cronstrue.toString(cron);
          if (generatedTimezone) {
            return `${cronDesc}, in ${formatTimezone(generatedTimezone)} timezone.`;
          }
          return cronDesc;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // eslint-disable-next-line react-hooks/set-state-in-render
          setGenerationStatus("error");
        }
        break;
      default:
        assertNever(generationStatus);
    }
  }, [generationStatus, cron, generatedTimezone, cronErrorMessage]);

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
                  <p>{cronDescription}</p>
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
