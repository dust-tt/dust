import {
  AnimatedText,
  ArrowRightIcon,
  ContentMessage,
  DotIcon,
  Label,
  TextArea,
} from "@dust-tt/sparkle";
import cronstrue from "cronstrue";
import React, { useMemo, useRef, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

import type { ScheduleFormValues } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { useTextAsCronRule } from "@app/lib/swr/agent_triggers";
import { debounce } from "@app/lib/utils/debounce";
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
  workspace: LightWorkspaceType;
}

export function ScheduleEditionScheduler({
  isEditor,
  workspace,
}: ScheduleEditionSchedulerProps) {
  const { control, setValue } = useFormContext<ScheduleFormValues>();
  const {
    field: {
      value: naturalLanguageDescription,
      onChange: onNaturalDescriptionChange,
    },
  } = useController({ control, name: "naturalLanguageDescription" });

  const cron = useWatch({ control, name: "cron" });

  const [generationStatus, setGenerationStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [cronErrorMessage, setCronErrorMessage] = useState<string | null>(null);
  const [generatedTimezone, setGeneratedTimezone] = useState<string | null>(
    null
  );
  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  const textAsCronRule = useTextAsCronRule({ workspace });

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
        } catch (error) {
          setGenerationStatus("error");
        }
        break;
      default:
        assertNever(generationStatus);
    }
  }, [generationStatus, cron, generatedTimezone, cronErrorMessage]);

  const handleNaturalDescriptionChange = async (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const txt = e.target.value;
    onNaturalDescriptionChange(txt);
    setGenerationStatus(txt ? "loading" : "idle");

    if (txt.length >= MIN_DESCRIPTION_LENGTH) {
      debounce(
        debounceHandle,
        async () => {
          // Cancel previous request
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }

          abortControllerRef.current = new AbortController();
          const signal = abortControllerRef.current.signal;

          setValue("cron", "");
          const result = await textAsCronRule(txt, signal);

          // If the request was not aborted, we can update the form
          if (!signal.aborted) {
            if (result.isOk()) {
              setValue("cron", result.value.cron);
              setValue("timezone", result.value.timezone);
              setGeneratedTimezone(result.value.timezone);
              setGenerationStatus("idle");
            } else {
              setGenerationStatus("error");
              setCronErrorMessage(extractErrorMessage(result.error));
              setGeneratedTimezone(null);
            }
          }
        },
        500
      );
    } else {
      if (debounceHandle.current) {
        clearTimeout(debounceHandle.current);
        debounceHandle.current = undefined;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  };

  return (
    <>
      <Label htmlFor="trigger-description">Scheduler</Label>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Describe when you want the agent to run in natural language.
      </p>
      <TextArea
        id="schedule-description"
        placeholder='e.g. "run every day at 9 AM", or "Late afternoon on business days"...'
        rows={3}
        value={naturalLanguageDescription ?? ""}
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
    </>
  );
}
